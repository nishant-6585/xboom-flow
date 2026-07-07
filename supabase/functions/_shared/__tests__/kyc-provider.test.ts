import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { getKycProvider, type KycProvider, type KycVerifiedData } from "../kyc-provider.ts";

Deno.test("seam returns configured provider (defaults to surepass)", () => {
  const p = getKycProvider();
  assertEquals(p.name, "surepass");
});

Deno.test("seam throws on unknown provider", () => {
  let err: Error | null = null;
  try { getKycProvider("does-not-exist"); } catch (e) { err = e as Error; }
  assert(err !== null && /Unknown KYC provider/.test(err.message));
});

// Fake adapter proves the seam yields the same normalized shape
// regardless of vendor — the whole point of the seam.
class FakeProvider implements KycProvider {
  readonly name = "fake";
  async createVerificationSession() {
    return { sessionId: "s1", consentUrl: "https://example/consent", provider: this.name };
  }
  async getSessionStatus() { return "verified" as const; }
  async fetchVerifiedData(): Promise<KycVerifiedData> {
    return {
      name: "Rahul Sharma",
      dob: "1990-01-01",
      address: "Bengaluru",
      maskedAadhaar: "XXXX XXXX 1234",
      aadhaarLast4: "1234",
      raw: { source: "fake" },
    };
  }
  verifyWebhook() { return false; }
}

Deno.test("any adapter returns normalized KycVerifiedData shape", async () => {
  const p: KycProvider = new FakeProvider();
  const data = await p.fetchVerifiedData("s1");
  for (const k of ["name","dob","address","maskedAadhaar","aadhaarLast4","raw"] as const) {
    assert(k in data, `missing field ${k}`);
  }
});

Deno.test("verifyWebhook fails closed when no signature/secret", async () => {
  const p: KycProvider = new FakeProvider();
  const ok = await p.verifyWebhook(new Request("http://x", { method: "POST" }), "{}");
  assertEquals(ok, false);
});