import { createClient } from "npm:@supabase/supabase-js@2";
import { mirrorIntoInternalOrders, upsertWoocommerceOrder } from "../_shared/woo-mirror.ts";
export { mirrorIntoInternalOrders } from "../_shared/woo-mirror.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wc-webhook-topic, x-wc-webhook-signature, x-wc-webhook-source, xboom_secret",
};

// HMAC-SHA256 base64 of raw body using WOOCOMMERCE_WEBHOOK_SECRET
async function verifyWooSignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    const topic = req.headers.get("x-wc-webhook-topic") || "unknown";
    const signature = req.headers.get("x-wc-webhook-signature");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle form-encoded requests (WooCommerce ping/verification)
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = await req.text();
      console.log(`[woocommerce-webhook] Form-encoded ping received: ${body}`);
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read raw body for HMAC verification BEFORE parsing
    const rawBody = await req.text();

    // HMAC verify (skip only when secret not configured — keeps backward compat for setup)
    const hmacSecret = Deno.env.get("WOOCOMMERCE_WEBHOOK_SECRET");
    if (!hmacSecret) {
      console.error("[woocommerce-webhook] WOOCOMMERCE_WEBHOOK_SECRET not configured — rejecting");
      return new Response(JSON.stringify({ success: false, error: "server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    {
      const ok = await verifyWooSignature(rawBody, signature, hmacSecret);
      if (!ok) {
        console.warn("[woocommerce-webhook] HMAC verification FAILED");
        await supabase.from("woo_sync_logs").insert({
          event_type: "hmac_fail",
          direction: "in",
          status: "failed",
          error_message: "Invalid HMAC signature",
          payload: { topic, has_sig: !!signature },
        });
        return new Response(JSON.stringify({ success: false, error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const payload = JSON.parse(rawBody);

    console.log(`[woocommerce-webhook] Received topic: ${topic}`);
    console.log(`[woocommerce-webhook] Order ID: ${payload?.id || "N/A"}, Status: ${payload?.status || "N/A"}`);

    // Only handle order.* events. Cart/abandoned plugin topics are no longer supported.
    if (topic === "order.created" || topic === "order.updated") {
        const orderId = String(payload?.id || "");
        if (!orderId) {
          console.warn("[woocommerce-webhook] Missing order ID, skipping");
        } else {
          await upsertWoocommerceOrder(supabase, payload, orderId, "webhook");
          await mirrorIntoInternalOrders(supabase, payload, orderId, "webhook_in");
        }
    } else {
      console.log(`[woocommerce-webhook] Ignoring unsupported topic: ${topic}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[woocommerce-webhook] Error:", error instanceof Error ? error.message : "Unknown error");
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
