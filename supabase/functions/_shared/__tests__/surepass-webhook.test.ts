import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { SurepassProvider } from "../kyc-providers/surepass.ts";

async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  return Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("verifyWebhook rejects unsigned request", async () => {
  Deno.env.set("SUREPASS_WEBHOOK_SECRET", "shhh");
  const p = new SurepassProvider();
  const req = new Request("http://x", { method: "POST" });
  assertEquals(await p.verifyWebhook(req, "{}"), false);
});

Deno.test("verifyWebhook rejects wrong signature", async () => {
  Deno.env.set("SUREPASS_WEBHOOK_SECRET", "shhh");
  const p = new SurepassProvider();
  const req = new Request("http://x", {
    method: "POST",
    headers: { "x-surepass-signature": "deadbeef" },
  });
  assertEquals(await p.verifyWebhook(req, "{}"), false);
});

Deno.test("verifyWebhook accepts valid signature", async () => {
  const secret = "shhh";
  Deno.env.set("SUREPASS_WEBHOOK_SECRET", secret);
  const body = JSON.stringify({ session_id: "abc", status: "verified" });
  const sig = await hmacHex(secret, body);
  const p = new SurepassProvider();
  const req = new Request("http://x", {
    method: "POST",
    headers: { "x-surepass-signature": sig },
  });
  assertEquals(await p.verifyWebhook(req, body), true);
});

Deno.test("verifyWebhook fails closed with no secret configured", async () => {
  Deno.env.delete("SUREPASS_WEBHOOK_SECRET");
  const p = new SurepassProvider();
  const req = new Request("http://x", {
    method: "POST",
    headers: { "x-surepass-signature": "anything" },
  });
  assertEquals(await p.verifyWebhook(req, "{}"), false);
});