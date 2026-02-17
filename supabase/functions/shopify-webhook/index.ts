import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-shopify-hmac-sha256, x-shopify-topic, x-shopify-shop-domain, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── HMAC Validation (timing-safe) ──────────────────────────────────────────

async function validateHmac(
  rawBody: string,
  hmacHeader: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const computedHash = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return timingSafeEqual(computedHash, hmacHeader);
  } catch {
    return false;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
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

// ─── Health Check (admin-only, JWT-gated) ───────────────────────────────────

async function handleHealthCheck(req: Request): Promise<Response> {
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

  // Check webhook secret status
  const apiSecret = Deno.env.get("SHOPIFY_API_SECRET");
  const secretConfigured = !!apiSecret;

  // Check DB connectivity
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let dbConnected = false;
  try {
    const { error } = await serviceClient
      .from("shopify_orders_raw")
      .select("id")
      .limit(1);
    dbConnected = !error;
  } catch {
    dbConnected = false;
  }

  return new Response(
    JSON.stringify({
      status: secretConfigured && dbConnected ? "healthy" : "degraded",
      checks: {
        webhook_secret: secretConfigured ? "configured" : "missing",
        database: dbConnected ? "connected" : "unreachable",
      },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ─── Webhook Registration Utility ───────────────────────────────────────────

async function registerShopifyWebhooks(req: Request): Promise<Response> {
  // Admin-only
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

  const storeDomain = Deno.env.get("SHOPIFY_STORE_DOMAIN");
  const adminApiToken = Deno.env.get("SHOPIFY_ADMIN_API_TOKEN");

  if (!storeDomain || !adminApiToken) {
    return new Response(
      JSON.stringify({ error: "Shopify credentials not configured" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/shopify-webhook`;

  const webhooks = [
    { topic: "orders/create", address: webhookUrl, format: "json" },
    { topic: "orders/updated", address: webhookUrl, format: "json" },
  ];

  const results = [];

  for (const webhook of webhooks) {
    try {
      const response = await fetch(
        `https://${storeDomain}/admin/api/2024-01/webhooks.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": adminApiToken,
          },
          body: JSON.stringify({ webhook }),
        }
      );

      const data = await response.json();
      results.push({
        topic: webhook.topic,
        success: response.ok,
        status: response.status,
        id: data?.webhook?.id || null,
        error: response.ok ? null : (data?.errors || "Unknown error"),
      });
    } catch (err) {
      results.push({
        topic: webhook.topic,
        success: false,
        error: err.message,
      });
    }
  }

  return new Response(
    JSON.stringify({ registered: results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ─── Main Webhook Handler ───────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Route: health check
  const url = new URL(req.url);
  if (url.searchParams.get("action") === "health") {
    return handleHealthCheck(req);
  }

  // Route: register webhooks
  if (url.searchParams.get("action") === "register") {
    return registerShopifyWebhooks(req);
  }

  // ── Webhook POST from Shopify ──────────────────────────────────────────────
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Read raw body FIRST (before any .json() call) for HMAC validation
  const rawBody = await req.text();

  // Validate HMAC
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  if (!hmacHeader) {
    return new Response(
      JSON.stringify({ error: "Missing HMAC signature" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const apiSecret = Deno.env.get("SHOPIFY_API_SECRET");
  if (!apiSecret) {
    console.error("SHOPIFY_API_SECRET not configured");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const isValid = await validateHmac(rawBody, hmacHeader, apiSecret);
  if (!isValid) {
    console.warn("Webhook HMAC validation failed");
    return new Response(
      JSON.stringify({ error: "Invalid HMAC signature" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Parse payload
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Extract metadata for minimal logging (never log full payload)
  const shopDomain = req.headers.get("x-shopify-shop-domain") || "unknown";
  const topic = req.headers.get("x-shopify-topic") || "unknown";
  const orderId = String(payload.id || "unknown");
  const email = payload.email || "N/A";
  const totalPrice = payload.total_price || "0.00";

  console.log(
    `Shopify webhook received: topic=${topic}, shop=${shopDomain}, order_id=${orderId}, email=${email}, total=${totalPrice}`
  );

  // Only process orders/create and orders/updated topics
  if (topic !== "orders/create" && topic !== "orders/updated") {
    console.log(`Ignoring unsupported topic: ${topic}`);
    return new Response(
      JSON.stringify({ status: "ignored", reason: `Unsupported topic: ${topic}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Store in database using service_role (bypasses RLS)
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { error: insertError } = await serviceClient
    .from("shopify_orders_raw")
    .upsert(
      {
        shop_domain: shopDomain,
        order_id: orderId,
        payload: payload,
        processing_status: "pending",
        retry_count: 0,
        webhook_topic: topic,
      },
      {
        onConflict: "shop_domain,order_id",
        ignoreDuplicates: false,
      }
    );

  if (insertError) {
    console.error("Failed to store webhook payload:", insertError.message);
    return new Response(
      JSON.stringify({ error: "Storage error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`Order ${orderId} stored successfully from ${shopDomain}`);

  return new Response(
    JSON.stringify({ status: "ok" }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
