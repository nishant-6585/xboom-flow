import {
  assert,
  assertEquals,
  assertNotEquals,
  assertRejects,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  decryptToken,
  encryptToken,
  isEncrypted,
} from "../token-encryption.ts";

const KEY = "test-key-material-please-ignore-0123456789";

Deno.test("round-trips a token", async () => {
  const ct = await encryptToken("ya29.super-secret", KEY);
  assert(isEncrypted(ct), "output must carry enc:v1: prefix");
  assertNotEquals(ct, "ya29.super-secret");
  assertEquals(await decryptToken(ct, KEY), "ya29.super-secret");
});

Deno.test("uses a fresh IV per call (no deterministic ciphertext)", async () => {
  const a = await encryptToken("same-plaintext", KEY);
  const b = await encryptToken("same-plaintext", KEY);
  assertNotEquals(a, b);
});

Deno.test("passes legacy plaintext through decrypt untouched", async () => {
  assertEquals(await decryptToken("legacy-plain-token", KEY), "legacy-plain-token");
});

Deno.test("rejects tampered ciphertext", async () => {
  const ct = await encryptToken("secret", KEY);
  const tampered = ct.slice(0, -2) + (ct.endsWith("A") ? "B" : "A") + "=";
  await assertRejects(() => decryptToken(tampered, KEY));
});

Deno.test("rejects wrong key", async () => {
  const ct = await encryptToken("secret", KEY);
  await assertRejects(() => decryptToken(ct, "different-key-material"));
});

Deno.test("empty input passes through both directions", async () => {
  assertEquals(await encryptToken("", KEY), "");
  assertEquals(await decryptToken("", KEY), "");
  assertEquals(await decryptToken(null, KEY), "");
});
