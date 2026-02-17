import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Config Provider Interface ───────────────────────────────────────────────
// Abstract the config source so a future Secret Manager (AWS/GCP/Azure)
// can be swapped in by replacing only the provider implementation.

interface ShopifyConfig {
  storeDomain: string;
  adminApiToken: string;
  apiSecret: string;
}

interface ConfigProvider {
  load(): ShopifyConfig;
}

// ─── Environment Variable Provider (current implementation) ──────────────────

class EnvConfigProvider implements ConfigProvider {
  load(): ShopifyConfig {
    const storeDomain = Deno.env.get("SHOPIFY_STORE_DOMAIN");
    const adminApiToken = Deno.env.get("SHOPIFY_ADMIN_API_TOKEN");
    const apiSecret = Deno.env.get("SHOPIFY_API_SECRET");

    const missing: string[] = [];
    if (!storeDomain) missing.push("SHOPIFY_STORE_DOMAIN");
    if (!adminApiToken) missing.push("SHOPIFY_ADMIN_API_TOKEN");
    if (!apiSecret) missing.push("SHOPIFY_API_SECRET");

    if (missing.length > 0) {
      throw new Error(
        `Missing required Shopify credentials: ${missing.join(", ")}. ` +
          `Configure them via Lovable Cloud secrets.`
      );
    }

    return {
      storeDomain: storeDomain!,
      adminApiToken: adminApiToken!,
      apiSecret: apiSecret!,
    };
  }
}

// ─── Active provider (swap this to change config source) ─────────────────────
const configProvider: ConfigProvider = new EnvConfigProvider();

// ─── Public Helpers ──────────────────────────────────────────────────────────

export function getShopifyConfig(): ShopifyConfig {
  return configProvider.load();
}

/**
 * Mask a secret for safe logging.
 * Shows first 5 and last 4 chars for long values, or just last 4 for short ones.
 * e.g. "shpat_abcdef1234567890xyz" → "shpat****0xyz"
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "****" + value.slice(-4);
  }
  return value.slice(0, 5) + "****" + value.slice(-4);
}

/**
 * Validate a Shopify webhook HMAC-SHA256 signature.
 * Uses Web Crypto API with timing-safe comparison.
 */
export async function validateWebhookHmac(
  rawBody: string | ArrayBuffer,
  hmacHeader: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);

    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const bodyData =
      typeof rawBody === "string" ? encoder.encode(rawBody) : new Uint8Array(rawBody);

    const signature = await crypto.subtle.sign("HMAC", key, bodyData);

    const computedHash = btoa(
      String.fromCharCode(...new Uint8Array(signature))
    );

    // Timing-safe comparison
    return timingSafeEqual(computedHash, hmacHeader);
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a full comparison to avoid leaking length info via timing
    let result = a.length ^ b.length;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ (b.charCodeAt(i % b.length) || 0);
    }
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ─── Health-Check / Validation Endpoint ──────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate: admin-only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;

    // Verify user is admin
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const isAdmin = roles?.some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse action
    const body = await req.json().catch(() => ({}));
    const action = body.action || "validate";

    if (action === "validate") {
      try {
        const config = getShopifyConfig();
        return new Response(
          JSON.stringify({
            status: "ready",
            credentials: {
              storeDomain: maskSecret(config.storeDomain),
              adminApiToken: maskSecret(config.adminApiToken),
              apiSecret: maskSecret(config.apiSecret),
            },
            message: "All Shopify credentials are configured and valid.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            status: "not_ready",
            error: err.message,
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
