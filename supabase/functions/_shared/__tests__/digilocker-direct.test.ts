import { assertEquals, assert, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  DigiLockerDirectProvider,
  type OAuthAuthorizeMeta,
  parseDDMMYYYY,
  verifyHmac,
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

// ── HMAC helpers for building test responses ─────────────────────────────
async function hmacHeader(body: string | Uint8Array, key = "TEST_SECRET"): Promise<string> {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, bytes));
  let s = "";
  for (const b of sig) s += String.fromCharCode(b);
  return btoa(s);
}

function withFetch(handler: (req: Request) => Promise<Response> | Response) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(typeof input === "string" || input instanceof URL ? input.toString() : (input as Request).url, init);
    return Promise.resolve(handler(req));
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

Deno.test("authorize URL uses PKCE S256 + no openid scope + purpose=kyc + req_doctype", async () => {
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
  // scope=openid was removed: the DigiLocker client is configured WITHOUT
  // openid so the plain /public/oauth2/1/token authorization_code grant
  // succeeds. Sending openid puts the client into OIDC mode and the
  // partner endpoint rejects the grant with 'invalid_grant_type'.
  assertEquals(url.searchParams.get("scope"), null);
  assertEquals(url.searchParams.get("purpose"), "kyc");
  assertEquals(url.searchParams.get("req_doctype"), "DRVLC,PANCR");
});

Deno.test("parseDDMMYYYY converts DDMMYYYY → ISO and rejects garbage", () => {
  assertEquals(parseDDMMYYYY("01011990"), "1990-01-01");
  assertEquals(parseDDMMYYYY("31122005"), "2005-12-31");
  assertEquals(parseDDMMYYYY("1990-01-01"), "1990-01-01"); // passthrough
  assertEquals(parseDDMMYYYY("32122005"), null);           // invalid day
  assertEquals(parseDDMMYYYY("01131990"), null);           // invalid month
  assertEquals(parseDDMMYYYY(""), null);
  assertEquals(parseDDMMYYYY(null), null);
});

Deno.test("verifyHmac matches only when digest agrees", async () => {
  const body = new TextEncoder().encode("hello");
  const good = await hmacHeader(body);
  assertEquals(await verifyHmac(body, "TEST_SECRET", good), true);
  assertEquals(await verifyHmac(body, "TEST_SECRET", good.slice(0, -2) + "AA"), false);
  assertEquals(await verifyHmac(body, "WRONG", good), false);
  assertEquals(await verifyHmac(body, "TEST_SECRET", null), false);
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
    if (req.url.endsWith("/public/oauth2/2/files/issued")) {
      return new Response(JSON.stringify({ items: [{ doctype: "MARKS", uri: "in.gov.marks" }] }), { status: 200 });
    }
    return new Response("nope", { status: 404 });
  });
  try {
    const p = new DigiLockerDirectProvider();
    await assertRejects(
      () => p.exchangeCodeAndFetch("code", "verifier", "https://example.test/cb"),
      DocumentTypeDeniedError,
      "no_supported_document",
    );
  } finally { restore(); }
});

Deno.test("XML fetch 403 for every candidate → DocumentTypeDeniedError", async () => {
  const restore = withFetch(async (req) => {
    if (req.url.endsWith("/public/oauth2/1/token")) {
      return new Response(JSON.stringify({ access_token: "AT" }), { status: 200 });
    }
    if (req.url.endsWith("/public/oauth2/2/files/issued")) {
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
      "document_type_denied",
    );
  } finally { restore(); }
});

Deno.test("DL happy-path: HMAC-verified XML+PDF returns normalized shape and token identity", async () => {
  const xml = `<Certificate name="Rahul Sharma" dob="1990-01-01" dlNumber="MH1420110012345"><Address>Bengaluru</Address></Certificate>`;
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
  const xmlHmac = await hmacHeader(xml);
  const pdfHmac = await hmacHeader(pdf);
  const restore = withFetch(async (req) => {
    if (req.url.endsWith("/public/oauth2/1/token")) {
      return new Response(JSON.stringify({
        access_token: "AT",
        // refresh_token intentionally present here; adapter MUST strip it.
        refresh_token: "MUST_NOT_PERSIST",
        scope: "",
        digilockerid: "dl-abc-123",
        name: "Rahul Sharma",
        dob: "01011990",
        gender: "M",
        eaadhaar: "Y",
        consent_valid_till: "2027-01-01T00:00:00Z",
      }), { status: 200 });
    }
    if (req.url.endsWith("/public/oauth2/2/files/issued")) {
      return new Response(JSON.stringify({ items: [
        { doctype: "DRVLC", uri: "in.gov.transport-dl" },
      ]}), { status: 200 });
    }
    if (req.url.includes("/public/oauth2/1/xml/")) {
      return new Response(xml, { status: 200, headers: { hmac: xmlHmac } });
    }
    if (req.url.includes("/public/oauth2/1/file/")) {
      return new Response(pdf, { status: 200, headers: { hmac: pdfHmac } });
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
    // PDF stored on happy path
    assert(v.pdf && v.pdf.byteLength === pdf.byteLength);
    // Token identity captured + DDMMYYYY parsed
    assertEquals(v.tokenIdentity.digilockerid, "dl-abc-123");
    assertEquals(v.tokenIdentity.dob, "1990-01-01");
    assertEquals(v.tokenIdentity.consentValidTill, "2027-01-01T00:00:00Z");
    // refresh_token must not appear anywhere in the persisted raw payload
    assert(!JSON.stringify(v).includes("MUST_NOT_PERSIST"));
  } finally { restore(); }
});

Deno.test("XML HMAC mismatch → payload discarded, DocumentTypeDeniedError('hmac_mismatch')", async () => {
  const xml = `<Certificate name="X" dob="1990-01-01" dlNumber="AB123"><Address>Y</Address></Certificate>`;
  const restore = withFetch(async (req) => {
    if (req.url.endsWith("/public/oauth2/1/token")) {
      return new Response(JSON.stringify({ access_token: "AT" }), { status: 200 });
    }
    if (req.url.endsWith("/public/oauth2/2/files/issued")) {
      return new Response(JSON.stringify({ items: [
        { doctype: "DRVLC", uri: "in.gov.transport-dl" },
      ]}), { status: 200 });
    }
    if (req.url.includes("/public/oauth2/1/xml/")) {
      // Bad HMAC header
      return new Response(xml, { status: 200, headers: { hmac: "AAAA" } });
    }
    return new Response("nope", { status: 404 });
  });
  try {
    const p = new DigiLockerDirectProvider();
    await assertRejects(
      () => p.exchangeCodeAndFetch("code", "verifier", "https://example.test/cb"),
      DocumentTypeDeniedError,
      "hmac_mismatch",
    );
  } finally { restore(); }
});

Deno.test("verifyWebhook always false (OAuth adapter has no HMAC path)", async () => {
  const p = new DigiLockerDirectProvider();
  const ok = await p.verifyWebhook(new Request("http://x"), "{}");
  assertEquals(ok, false);
});

Deno.test("baseUrl normalisation: trailing dot/slash/whitespace stripped from authorize host", async () => {
  const original = Deno.env.get("DIGILOCKER_BASE_URL") || "";
  try {
    for (const dirty of [
      "https://digilocker.meripehchaan.gov.in.",
      "https://digilocker.meripehchaan.gov.in/",
      "https://digilocker.meripehchaan.gov.in.  ",
      "  https://digilocker.meripehchaan.gov.in./ ",
    ]) {
      Deno.env.set("DIGILOCKER_BASE_URL", dirty);
      const p = new DigiLockerDirectProvider();
      const s = await p.createVerificationSession(
        { accountId: "acc-x", fullName: "Test User", email: "t@example.com" },
        "ignored",
      );
      const url = new URL(s.consentUrl);
      assertEquals(url.host, "digilocker.meripehchaan.gov.in");
      assertEquals(url.hostname, "digilocker.meripehchaan.gov.in");
    }
  } finally {
    Deno.env.set("DIGILOCKER_BASE_URL", original);
  }
});