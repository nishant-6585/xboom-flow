import { createClient } from "npm:@supabase/supabase-js@2";
import { mirrorIntoInternalOrders } from "../_shared/woo-mirror.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

/**
 * Backfills WooCommerce 'processing' orders from the last N days (default 2)
 * into the internal `orders` table.
 *
 * Auth: requires either a valid Supabase JWT (Admin/Finance enforced server-side)
 *       OR X-Cron-Secret header matching CRON_SECRET (used by pg_cron).
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

    // Auth: cron header OR admin/finance JWT
    const cronHeader = req.headers.get("x-cron-secret");
    let authorized = false;
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
          const allowed = (roles || []).some((r: any) => r.role === "admin" || r.role === "finance");
          if (allowed) authorized = true;
        }
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Parse params
    let days = 2;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (typeof body?.days === "number" && body.days > 0 && body.days <= 30) days = body.days;
      } catch { /* ignore */ }
    } else {
      const url = new URL(req.url);
      const d = parseInt(url.searchParams.get("days") || "2", 10);
      if (!isNaN(d) && d > 0 && d <= 30) days = d;
    }

    const after = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Page through Woo orders
    const base = wcUrl.replace(/\/$/, "");
    const auth = btoa(`${wcKey}:${wcSecret}`);
    let page = 1;
    const perPage = 50;
    let totalProcessed = 0;
    let totalFailed = 0;

    while (page <= 20) {
      const apiUrl = `${base}/wp-json/wc/v3/orders?status=processing&after=${encodeURIComponent(after)}&per_page=${perPage}&page=${page}&orderby=date&order=desc`;
      const resp = await fetch(apiUrl, { headers: { Authorization: `Basic ${auth}` } });
      if (!resp.ok) {
        const txt = await resp.text();
        await supabase.from("woo_sync_logs").insert({
          event_type: "backfill", direction: "in", status: "failed",
          error_message: `Woo API ${resp.status}: ${txt.slice(0, 500)}`,
        });
        return new Response(JSON.stringify({ error: "Woo API error", status: resp.status }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const orders = await resp.json();
      if (!Array.isArray(orders) || orders.length === 0) break;

      for (const o of orders) {
        try {
          await mirrorIntoInternalOrders(supabase, o, String(o.id), "backfill");
          totalProcessed++;
        } catch (e) {
          totalFailed++;
          await supabase.from("woo_sync_logs").insert({
            woo_order_id: String(o.id), event_type: "backfill", direction: "in",
            status: "failed", error_message: e instanceof Error ? e.message : "unknown",
          });
        }
      }
      if (orders.length < perPage) break;
      page++;
    }

    return new Response(JSON.stringify({
      success: true, processed: totalProcessed, failed: totalFailed, days,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[woocommerce-orders-backfill] error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});