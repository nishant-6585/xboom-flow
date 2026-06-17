import { createClient } from "npm:@supabase/supabase-js@2";
import { isAuthorizedCron } from "../_shared/cron-auth.ts";
import { upsertWooProduct } from "../_shared/woo-product-map.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

/**
 * Pulls the full published WooCommerce product catalog from xboom.in via the
 * REST API and upserts each product into `pricelist`. Serves two callers:
 *   - the "Sync from Website" button on the Pricelist page (admin/supply_chain JWT)
 *   - the daily pg_cron reconcile job (X-Cron-Secret), as a safety net for any
 *     webhook deliveries that were missed.
 *
 * Internal pricing (cost/dealer/unit) is never touched — see woo-product-map.ts.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const wcUrl = Deno.env.get("WC_SITE_URL");
    const wcKey = Deno.env.get("WC_CONSUMER_KEY");
    const wcSecret = Deno.env.get("WC_CONSUMER_SECRET");

    if (!wcUrl || !wcKey || !wcSecret) {
      return new Response(JSON.stringify({ error: "WooCommerce credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: cron secret OR admin/supply_chain JWT
    let authorized = await isAuthorizedCron(req);
    if (!authorized) {
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        const { data: userData } = await supabase.auth.getUser(token);
        if (userData?.user) {
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userData.user.id);
          authorized = (roles || []).some(
            // deno-lint-ignore no-explicit-any
            (r: any) => r.role === "admin" || r.role === "supply_chain",
          );
        }
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base = wcUrl.replace(/\/$/, "");
    const auth = btoa(`${wcKey}:${wcSecret}`);
    const perPage = 100;
    let page = 1;
    let created = 0;
    let updated = 0;
    let linked = 0;
    let skipped = 0;
    let failed = 0;

    // Hard page cap so a runaway never loops forever.
    while (page <= 100) {
      const apiUrl =
        `${base}/wp-json/wc/v3/products?status=publish&per_page=${perPage}&page=${page}&orderby=id&order=asc`;
      const resp = await fetch(apiUrl, { headers: { Authorization: `Basic ${auth}` } });
      if (!resp.ok) {
        const txt = await resp.text();
        await supabase.from("woo_sync_logs").insert({
          event_type: "product_backfill",
          direction: "in",
          status: "failed",
          error_message: `Woo API ${resp.status}: ${txt.slice(0, 500)}`,
        });
        return new Response(JSON.stringify({ error: "Woo API error", status: resp.status }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const products = await resp.json();
      if (!Array.isArray(products) || products.length === 0) break;

      for (const p of products) {
        try {
          const result = await upsertWooProduct(supabase, p, "woocommerce_backfill");
          if (result.action === "created") created++;
          else if (result.action === "updated") updated++;
          else if (result.action === "linked") linked++;
          else skipped++;
        } catch (e) {
          failed++;
          await supabase.from("woo_sync_logs").insert({
            event_type: "product_backfill",
            direction: "in",
            status: "failed",
            error_message: e instanceof Error ? e.message : "unknown",
            payload: { woo_product_id: p?.id, name: p?.name },
          });
        }
      }

      if (products.length < perPage) break;
      page++;
    }

    await supabase.from("woo_sync_logs").insert({
      event_type: "product_backfill",
      direction: "in",
      status: "success",
      payload: { created, updated, linked, skipped, failed },
    });

    return new Response(
      JSON.stringify({ success: true, created, updated, linked, skipped, failed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[woocommerce-products-backfill] error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
