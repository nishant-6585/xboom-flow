/**
 * Shared cron authentication.
 *
 * Validates the X-Cron-Secret header against the canonical CRON_SECRET
 * value stored in Postgres `vault.decrypted_secrets`. Falls back to the
 * edge-function env var if vault is unreachable. The vault value is
 * fetched once per cold start and cached in-memory.
 *
 * This removes the previous mismatch between the value baked into the
 * edge-function env and the value used by `pg_cron` / DB triggers
 * (which can only read from Vault).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

let cachedSecret: string | null = null;
let cachedAt = 0;
const TTL_MS = 5 * 60 * 1000; // 5 min

async function loadVaultSecret(): Promise<string | null> {
  const now = Date.now();
  if (cachedSecret && now - cachedAt < TTL_MS) return cachedSecret;

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;

  try {
    const sb = createClient(url, key);
    const { data, error } = await sb
      .schema("vault" as any)
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", "CRON_SECRET")
      .maybeSingle();
    if (error || !data?.decrypted_secret) return null;
    cachedSecret = data.decrypted_secret as string;
    cachedAt = now;
    return cachedSecret;
  } catch (_e) {
    return null;
  }
}

/**
 * Returns true if the request carries a valid cron secret. Accepts the
 * value from Vault (canonical) OR the edge-function env (legacy fallback).
 */
export async function isAuthorizedCron(req: Request): Promise<boolean> {
  const provided = req.headers.get("x-cron-secret") ?? req.headers.get("X-Cron-Secret");
  if (!provided) return false;

  const vaultSecret = await loadVaultSecret();
  if (vaultSecret && provided === vaultSecret) return true;

  const envSecret = Deno.env.get("CRON_SECRET");
  if (envSecret && provided === envSecret) return true;

  return false;
}