// STUB: Sends a WhatsApp notification when an order status changes.
// Provider not yet selected — function accepts the trigger payload, validates
// it, logs the intent, and returns 200. When the provider is wired up
// (Interakt or Meta WABA), implement the send block below; the contract for
// callers stays the same.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { woo_order_id, new_status, customer_phone, tracking_url } = body || {};

    if (!woo_order_id || !new_status) {
      return new Response(
        JSON.stringify({ error: "woo_order_id and new_status are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(
      `[whatsapp-stub] Would notify order=${woo_order_id} status=${new_status} phone=${customer_phone || "n/a"} tracking=${tracking_url || "n/a"}`,
    );

    // Optional: persist a domain_event so we can wire the provider later
    // without re-deploying callers.
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await supabase.from("woocommerce_order_status_logs").insert({
        woo_order_id: String(woo_order_id),
        new_status: String(new_status),
        previous_status: null,
        source: "system",
        woo_api_success: null,
        woo_api_response: { whatsapp_stub: true, customer_phone, tracking_url },
        error_message: "WhatsApp provider not configured (stub)",
      });
    } catch (e) {
      console.warn("[whatsapp-stub] log insert failed:", e);
    }

    return new Response(
      JSON.stringify({ success: true, queued: false, stub: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});