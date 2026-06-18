import { createClient } from "npm:@supabase/supabase-js@2";
import { mirrorIntoInternalOrders, upsertWoocommerceOrder, WINDOW_START_ISO } from "../_shared/woo-mirror.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

/**
 * Periodic reconcile for WooCommerce orders. Pulls every order modified in
 * the last N days (default 7, cap 30) across the post-checkout statuses,
 * including custom `shipped` and `delivered`, and upserts both the
 * `woocommerce_orders` mirror and the internal `orders` row.
 *
 * Why this exists in addition to webhooks:
 *   - WooCommerce webhooks strip protected `_` meta (incl. the Advanced
 *     Shipment Tracking `_wc_shipment_tracking_items`), so tracking can be
 *     missing from real-time updates. Pulling via the authenticated REST
 *     endpoint returns the full meta including AST tracking.
 *   - Any missed/failed webhook (network, downtime, HMAC drift) is also
 *     recovered here.
 *
 * Auth: requires either X-Cron-Secret matching CRON_SECRET (pg_cron) OR a
 *       valid Supabase JWT belonging to admin / finance / supply_chain.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET");
    const wcUrl = Deno.env.get("WC_SITE_URL");
    const wcKey = Deno.env.get("WC_CONSUMER_KEY");
    const wcSecret = Deno.env.get("WC_CONSUMER_SECRET");

    if (!wcUrl || !wcKey || !wcSecret) {
      return new Response(JSON.stringify({ error: "WooCommerce credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: cron header OR admin/finance/supply_chain JWT
    const cronHeader = req.headers.get("x-cron-secret");
    let authorized = false;
    let triggeredBy = "cron";
    if (cronSecret && cronHeader === cronSecret) {
      authorized = true;
    } else {
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        const { data: userData } = await supabase.auth.getUser(token);
        if (userData?.user) {
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userData.user.id);
          // deno-lint-ignore no-explicit-any
          const allowed = (roles || []).some((r: any) => r.role === "admin" || r.role === "finance" || r.role === "supply_chain");
          if (allowed) {
            authorized = true;
            triggeredBy = `user:${userData.user.id}`;
          }
        }
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Parse params: days (default 7, cap 30)
    let days = 7;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (typeof body?.days === "number" && body.days > 0 && body.days <= 30) days = body.days;
      } catch { /* ignore */ }
    } else {
      const url = new URL(req.url);
      const d = parseInt(url.searchParams.get("days") || "7", 10);
      if (!isNaN(d) && d > 0 && d <= 30) days = d;
    }

    // modified_after window — bounded by the hard floor used everywhere else.
    const requestedAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const hardFloor = new Date(`${WINDOW_START_ISO}T00:00:00.000Z`);
    const after = (requestedAfter < hardFloor ? hardFloor : requestedAfter).toISOString();

    // Post-checkout statuses + terminal/refund states. Includes the custom
    // `shipped` and `delivered` statuses registered on the WC site.
    const statuses = "processing,on-hold,shipped,completed,delivered,cancelled,refunded";

    const base = wcUrl.replace(/\/$/, "");
    const auth = btoa(`${wcKey}:${wcSecret}`);
    let page = 1;
    const perPage = 50;
    let totalProcessed = 0;
    let totalFailed = 0;
    let totalMirrorFailed = 0;

    while (page <= 30) {
      const apiUrl = `${base}/wp-json/wc/v3/orders?status=${statuses}` +
        `&modified_after=${encodeURIComponent(after)}` +
        `&per_page=${perPage}&page=${page}&orderby=modified&order=desc`;
      const resp = await fetch(apiUrl, { headers: { Authorization: `Basic ${auth}` } });
      if (!resp.ok) {
        const txt = await resp.text();
        await supabase.from("woo_sync_logs").insert({
          event_type: "orders_reconcile", direction: "in", status: "failed",
          error_message: `Woo API ${resp.status}: ${txt.slice(0, 500)}`,
        });
        return new Response(JSON.stringify({ error: "Woo API error", status: resp.status }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const orders = await resp.json();
      if (!Array.isArray(orders) || orders.length === 0) break;

      for (const o of orders) {
        const oid = String(o.id);
        try {
          const r = await upsertWoocommerceOrder(supabase, o, oid, "reconcile");
          if (!r.ok) totalMirrorFailed++;
          await mirrorIntoInternalOrders(supabase, o, oid, "orders_reconcile");
          totalProcessed++;
        } catch (e) {
          totalFailed++;
          await supabase.from("woo_sync_logs").insert({
            woo_order_id: oid, event_type: "orders_reconcile", direction: "in",
            status: "failed",
            error_message: e instanceof Error ? e.message : "unknown",
          });
        }
      }
      if (orders.length < perPage) break;
      page++;
    }

    await supabase.from("woo_sync_logs").insert({
      event_type: "orders_reconcile", direction: "in", status: "success",
      error_message: `processed=${totalProcessed} failed=${totalFailed} mirror_failed=${totalMirrorFailed} days=${days} trigger=${triggeredBy}`,
    });

    return new Response(JSON.stringify({
      success: true,
      processed: totalProcessed,
      failed: totalFailed,
      mirror_failed: totalMirrorFailed,
      days,
      modified_after: after,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[woocommerce-orders-reconcile] error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});