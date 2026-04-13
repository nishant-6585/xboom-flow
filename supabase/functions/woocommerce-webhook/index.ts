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
    // Validate webhook secret
    const secret = req.headers.get("xboom_secret");
    const expectedSecret = Deno.env.get("WOOCOMMERCE_WEBHOOK_SECRET");

    if (!expectedSecret || secret !== expectedSecret) {
      console.warn("[woocommerce-webhook] Unauthorized: invalid or missing secret");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
