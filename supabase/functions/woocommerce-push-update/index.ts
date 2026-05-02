import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

/**
 * Reverse sync: pushes XBoom internal order changes back to WooCommerce.
 * Called by DB trigger via pg_net with X-Cron-Secret.
 * Body: { order_id, external_id, status, refund_status, is_rto, cancelled_at, actual_delivery, customer_notes }
 *
 * Maps internal lifecycle to Woo status only when it's clean:
 *   actual_delivery set        -> completed
 *   refund_status='refunded'   -> refunded
 *   cancelled_at set / status=cancelled -> cancelled
 *   is_rto=true                -> cancelled (with note)
 * Anything else: skip.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  const headerSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || headerSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { order_id, external_id, status, refund_status, is_rto, cancelled_at, actual_delivery, customer_notes } = body || {};
  if (!external_id || !order_id) {
    return new Response(JSON.stringify({ error: "Missing external_id/order_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Determine target Woo status
  let wooStatus: string | null = null;
  let note: string | null = customer_notes || null;

  if (refund_status === "refunded") {
    wooStatus = "refunded";
  } else if (cancelled_at || status === "cancelled") {
    wooStatus = "cancelled";
  } else if (is_rto === true) {
    wooStatus = "cancelled";
    note = note ? `${note}\n[RTO]` : "[RTO] Return to origin";
  } else if (actual_delivery || status === "delivery_done") {
    wooStatus = "completed";
  }

  if (!wooStatus) {
    await supabase.from("woo_sync_logs").insert({
      woo_order_id: String(external_id), internal_order_id: order_id,
      event_type: "reverse_push", direction: "out", status: "skipped",
      error_message: `No clean Woo mapping for status='${status}'`,
    });
    return new Response(JSON.stringify({ success: true, skipped: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const wcUrl = Deno.env.get("WC_SITE_URL");
  const wcKey = Deno.env.get("WC_CONSUMER_KEY");
  const wcSecret = Deno.env.get("WC_CONSUMER_SECRET");
  if (!wcUrl || !wcKey || !wcSecret) {
    await supabase.from("woo_sync_logs").insert({
      woo_order_id: String(external_id), internal_order_id: order_id,
      event_type: "reverse_push", direction: "out", status: "failed",
      error_message: "WC credentials missing",
    });
    return new Response(JSON.stringify({ error: "WC credentials missing" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const base = wcUrl.replace(/\/$/, "");
  const auth = btoa(`${wcKey}:${wcSecret}`);
  const url = `${base}/wp-json/wc/v3/orders/${external_id}`;

  const wooBody: Record<string, unknown> = { status: wooStatus };
  if (note) wooBody.customer_note = note;

  // Up to 3 attempts with backoff
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(wooBody),
      });
      const respText = await resp.text();
      if (resp.ok) {
        await supabase.from("woo_sync_logs").insert({
          woo_order_id: String(external_id), internal_order_id: order_id,
          event_type: "reverse_push", direction: "out", status: "success",
          woo_status: wooStatus, attempt, payload: wooBody,
        });
        return new Response(JSON.stringify({ success: true, woo_status: wooStatus }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      lastErr = `HTTP ${resp.status}: ${respText.slice(0, 300)}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "fetch error";
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt));
  }

  await supabase.from("woo_sync_logs").insert({
    woo_order_id: String(external_id), internal_order_id: order_id,
    event_type: "reverse_push", direction: "out", status: "failed",
    woo_status: wooStatus, attempt: 3, error_message: lastErr, payload: wooBody,
  });

  return new Response(JSON.stringify({ success: false, error: lastErr }),
    { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});