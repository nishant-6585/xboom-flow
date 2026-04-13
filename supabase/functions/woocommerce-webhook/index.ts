import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wc-webhook-topic, x-wc-webhook-signature, x-wc-webhook-source, xboom_secret",
};

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
    // TODO: Implement HMAC validation using x-wc-webhook-signature header
    // WooCommerce does not support custom headers — xboom_secret validation removed temporarily
    console.log("[woocommerce-webhook] Request received (auth: open, pending HMAC implementation)");

    // Parse topic and payload
    const topic = req.headers.get("x-wc-webhook-topic") || "unknown";
    const payload = await req.json();

    console.log(`[woocommerce-webhook] Received topic: ${topic}`);
    console.log(`[woocommerce-webhook] Order ID: ${payload?.id || "N/A"}, Status: ${payload?.status || "N/A"}`);

    // Handle supported topics
    switch (topic) {
      case "order.created":
        console.log(`[woocommerce-webhook] New order #${payload?.id} — Total: ${payload?.total}, Customer: ${payload?.billing?.first_name} ${payload?.billing?.last_name}`);
        // TODO: Insert into database table (e.g. woocommerce_orders)
        break;

      case "order.updated":
        console.log(`[woocommerce-webhook] Order #${payload?.id} updated — Status: ${payload?.status}`);
        // TODO: Update existing record in database
        break;

      default:
        console.log(`[woocommerce-webhook] Unhandled topic: ${topic}`);
        break;
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
