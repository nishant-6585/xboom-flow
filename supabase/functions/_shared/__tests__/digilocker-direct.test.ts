import { assertEquals, assert, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  DigiLockerDirectProvider,
  type OAuthAuthorizeMeta,
} from "../kyc-providers/digilocker-direct.ts";
import { DocumentTypeDeniedError } from "../kyc-provider.ts";

function setEnv(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) Deno.env.set(k, v);
}

setEnv({
  DIGILOCKER_CLIENT_ID: "TEST_CLIENT",
  DIGILOCKER_CLIENT_SECRET: "TEST_SECRET",
  DIGILOCKER_REDIRECT_URI: "https://example.test/functions/v1/digilocker-callback",
  DIGILOCKER_BASE_URL: "https://mocked.digilocker.test",
});

function withFetch(handler: (req: Request) => Promise<Response> | Response) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(typeof input === "string" || input instanceof URL ? input.toString() : (input as Request).url, init);
    return Promise.resolve(handler(req));
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

Deno.test("authorize URL uses PKCE S256 and returns state + verifier", async () => {
  const p = new DigiLockerDirectProvider();
  const s = await p.createVerificationSession(
    { accountId: "acc-1", fullName: "Test User", email: "t@example.com" },
    "ignored",
  );
  const meta = s.raw as OAuthAuthorizeMeta;
  assert(meta.state.length >= 20);
  assert(meta.codeVerifier.length >= 40);
  const url = new URL(s.consentUrl);
  assertEquals(url.searchParams.get("response_type"), "code");
  assertEquals(url.searchParams.get("code_challenge_method"), "S256");
  assertEquals(url.searchParams.get("client_id"), "TEST_CLIENT");
  assertEquals(
    url.searchParams.get("redirect_uri"),
    "https://example.test/functions/v1/digilocker-callback",
  );
  assert(url.searchParams.get("code_challenge"));
});

Deno.test("exchange failure surfaces provider error", async () => {
  const restore = withFetch(async (req) => {
    if (req.url.endsWith("/public/oauth2/1/token")) {
      return new Response("bad", { status: 400 });
    }
    return new Response("nope", { status: 404 });
  });
  try {
    const p = new DigiLockerDirectProvider();
    await assertRejects(
      () => p.exchangeCodeAndFetch("code", "verifier", "https://example.test/cb"),
      Error,
      "token exchange failed",
    );
  } finally { restore(); }
});

Deno.test("no DL/PAN in issued list → DocumentTypeDeniedError", async () => {
  const restore = withFetch(async (req) => {
    if (req.url.endsWith("/public/oauth2/1/token")) {
      return new Response(JSON.stringify({ access_token: "AT" }), { status: 200 });
    }
    if (req.url.endsWith("/public/oauth2/1/files/issued")) {
      return new Response(JSON.stringify({ items: [{ doctype: "MARKS", uri: "in.gov.marks" }] }), { status: 200 });
    }
    return new Response("nope", { status: 404 });
  });
  try {
    const p = new DigiLockerDirectProvider();
    await assertRejects(
      () => p.exchangeCodeAndFetch("code", "verifier", "https://example.test/cb"),
      DocumentTypeDeniedError,
    );
  } finally { restore(); }
});

Deno.test("XML fetch 403 for every candidate → DocumentTypeDeniedError", async () => {
  const restore = withFetch(async (req) => {
    if (req.url.endsWith("/public/oauth2/1/token")) {
      return new Response(JSON.stringify({ access_token: "AT" }), { status: 200 });
    }
    if (req.url.endsWith("/public/oauth2/1/files/issued")) {
      return new Response(JSON.stringify({ items: [
        { doctype: "DRVLC", uri: "in.gov.transport-dl" },
        { doctype: "PANCR", uri: "in.gov.pan" },
      ]}), { status: 200 });
    }
    if (req.url.includes("/public/oauth2/1/xml/")) {
      return new Response("denied", { status: 403 });
    }
    return new Response("nope", { status: 404 });
  });
  try {
    const p = new DigiLockerDirectProvider();
    await assertRejects(
      () => p.exchangeCodeAndFetch("code", "verifier", "https://example.test/cb"),
      DocumentTypeDeniedError,
    );
  } finally { restore(); }
});

Deno.test("DL XML happy-path returns normalized shape (name masked doc number)", async () => {
  const restore = withFetch(async (req) => {
    if (req.url.endsWith("/public/oauth2/1/token")) {
      return new Response(JSON.stringify({ access_token: "AT", scope: "read" }), { status: 200 });
    }
    if (req.url.endsWith("/public/oauth2/1/files/issued")) {
      return new Response(JSON.stringify({ items: [
        { doctype: "DRVLC", uri: "in.gov.transport-dl" },
      ]}), { status: 200 });
    }
    if (req.url.includes("/public/oauth2/1/xml/")) {
      const xml = `<Certificate name="Rahul Sharma" dob="1990-01-01" dlNumber="MH1420110012345"><Address>Bengaluru</Address></Certificate>`;
      return new Response(xml, { status: 200 });
    }
    return new Response("nope", { status: 404 });
  });
  try {
    const p = new DigiLockerDirectProvider();
    const v = await p.exchangeCodeAndFetch("code", "verifier", "https://example.test/cb");
    assertEquals(v.name, "Rahul Sharma");
    assertEquals(v.dob, "1990-01-01");
    assertEquals(v.documentType, "driving_license");
    assertEquals(v.documentNumberFull, "MH1420110012345");
    assert(v.maskedDocumentNumber && v.maskedDocumentNumber.endsWith("2345"));
    assertEquals(v.address, "Bengaluru");
  } finally { restore(); }
});

Deno.test("verifyWebhook always false (OAuth adapter has no HMAC path)", async () => {
  const p = new DigiLockerDirectProvider();
  const ok = await p.verifyWebhook(new Request("http://x"), "{}");
  assertEquals(ok, false);
});