/**
 * Shared WooCommerce webhook HMAC verification.
 *
 * WooCommerce signs each webhook delivery with an HMAC-SHA256 (base64) of the
 * raw request body, keyed on the secret configured for that webhook. The same
 * `WOOCOMMERCE_WEBHOOK_SECRET` is reused across the order and product webhooks,
 * so configure both Woo webhooks with that value.
 */
export async function verifyWooSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
  // constant-time compare
  if (computed.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
