// AES-256-GCM at-rest encryption for OAuth tokens.
//
// Wire protocol for stored ciphertext:
//   "enc:v1:" + base64( iv(12 bytes) || ciphertext+tag )
//
// The key comes from the `GMAIL_TOKEN_ENCRYPTION_KEY` env var. Any string is
// accepted; we derive a 256-bit key with SHA-256 so operators can rotate to
// arbitrary-length secrets without re-encoding.

const ENC_PREFIX = "enc:v1:";

let cachedKey: CryptoKey | null = null;
let cachedKeyMaterial: string | null = null;

function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKey(material?: string): Promise<CryptoKey> {
  const raw = material ?? Deno.env.get("GMAIL_TOKEN_ENCRYPTION_KEY") ?? "";
  if (!raw) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY is not configured");
  if (cachedKey && cachedKeyMaterial === raw) return cachedKey;
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)),
  );
  cachedKey = await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  cachedKeyMaterial = raw;
  return cachedKey;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

export async function encryptToken(
  plaintext: string,
  keyMaterial?: string,
): Promise<string> {
  if (!plaintext) return plaintext;
  const key = await getKey(keyMaterial);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv, 0);
  combined.set(ct, iv.length);
  return ENC_PREFIX + b64encode(combined);
}

export async function decryptToken(
  stored: string | null | undefined,
  keyMaterial?: string,
): Promise<string> {
  if (!stored) return "";
  // Backwards-compat: legacy rows still hold plaintext. Return as-is; the
  // next OAuth refresh/callback will rewrite them encrypted.
  if (!isEncrypted(stored)) return stored;
  const key = await getKey(keyMaterial);
  const combined = b64decode(stored.slice(ENC_PREFIX.length));
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}
