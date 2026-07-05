import { createClient } from "npm:@supabase/supabase-js@2";
import { isAuthorizedCron } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Use the official WooCommerce REST API (v3) with Basic auth.
// status=any returns ALL statuses including custom ones (delivered,
// return-requested, return-approved, return-cancelled, etc.) — no
// filtering, no transforms. We store the raw WooCommerce status.
//
// MODES:
//   mode=backfill     → walk all pages from start_page (default 1) until
//                       WooCommerce returns < per_page items. Self-chains:
//                       after processing `max_pages` (default 10) it
//                       invokes itself with `start_page=next_page` so the
//                       full ~20k history can finish in the background
//                       without hitting the edge-runtime wall-time limit.
//   mode=incremental  → uses `modified_after` from `woocommerce_sync_state`
//                       (or the value in the request body) to fetch only
//                       changed orders since the last successful run.
//   mode=manual       → same as incremental but flagged for UI-triggered
//                       runs so we can show the source in audit/health UI.
const WC_SITE_URL = (Deno.env.get("WC_SITE_URL") || "https://xboom.in").replace(/\/$/, "");
const WC_KEY = Deno.env.get("WC_CONSUMER_KEY") || "";
const WC_SECRET = Deno.env.get("WC_CONSUMER_SECRET") || "";
const WC_AUTH = "Basic " + btoa(`${WC_KEY}:${WC_SECRET}`);

function mapOrder(order: any) {
  const orderId = String(order?.id || "");
  if (!orderId) return null;

  // Preserve the EXACT WooCommerce status. No mapping. No transforms.
  const wooStatus: string = order?.status || "pending";
  const total = parseFloat(order?.total || "0");

  const lineItems = Array.isArray(order?.line_items) ? order.line_items : [];
  const firstItem = lineItems[0] || {};
  const productName = lineItems.length === 0
    ? "Unknown Product"
    : lineItems.length === 1
      ? (firstItem.name || "Unknown Product")
      : `${firstItem.name || "Unknown"} + ${lineItems.length - 1} more`;
  const totalQuantity = lineItems.reduce(
    (sum: number, it: any) => sum + (Number(it?.quantity) || 0),
    0,
  ) || 1;

  const billing = order?.billing || {};
  const shipping = order?.shipping || {};
  const customerName = `${billing.first_name || ""} ${billing.last_name || ""}`.trim()
    || billing.email || "Unknown";
  // Phone priority: billing.phone -> shipping.phone -> null. Trim to avoid empty strings.
  const rawPhone = (billing.phone ?? shipping.phone ?? "").toString().trim();
  const phone: string | null = rawPhone.length > 0 ? rawPhone : null;
  console.log(`[sync] order ${orderId} phone="${phone ?? ""}"`);
  const shippingParts = [
    shipping.address_1, shipping.address_2, shipping.city,
    shipping.state, shipping.postcode, shipping.country,
  ].filter(Boolean);
  const shippingAddress = shippingParts.join(", ") || null;

  // Payment-status mapping is for our internal "amount_paid" bookkeeping
  // only. It does NOT change order_status, which remains the raw WC value.
  const paymentStatusMap: Record<string, string> = {
    completed: "paid", processing: "paid", "on-hold": "pending",
    pending: "pending", failed: "failed", cancelled: "cancelled",
    refunded: "refunded", delivered: "paid",
  };
  const isPaid = wooStatus === "completed" || wooStatus === "processing" || wooStatus === "delivered";

  return {
    woo_order_id: orderId,
    order_number: order?.number ? String(order.number) : orderId,
    source: "xboom_website",
    order_status: wooStatus,
    financial_status: wooStatus,
    fulfillment_status: (wooStatus === "completed" || wooStatus === "delivered") ? "fulfilled" : "unfulfilled",
    product_name: productName,
    product_code: firstItem.sku || null,
    product_category: "Consumer Drones",
    quantity: totalQuantity,
    customer_name: customerName,
    customer_company: billing.company || "",
    customer_email: billing.email || "",
    customer_phone: phone,
    shipping_address: shippingAddress,
    selling_price: total,
    total_sales_amount: total,
    amount_paid: isPaid ? total : 0,
    payment_status: paymentStatusMap[wooStatus] || "pending",
    currency: order?.currency || "INR",
    line_items: lineItems,
    raw_data: order,
    internal_notes: order?.payment_method_title ? `Payment: ${order.payment_method_title}` : null,
    woo_created_at: order?.date_created_gmt ? `${order.date_created_gmt}Z` : (order?.date_created || null),
    woo_updated_at: order?.date_modified_gmt ? `${order.date_modified_gmt}Z` : (order?.date_modified || null),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Restrict to trusted callers only. Accept either a valid cron secret OR
  // an admin/supply_chain/finance JWT (matches the sibling
  // `woocommerce-orders-backfill` function). This prevents anonymous
  // callers from triggering a recursive, self-chaining backfill that
  // could cost quota / abuse the WooCommerce API.
  const supabaseUrlEarly = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKeyEarly = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKeyEarly = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  let authorized = await isAuthorizedCron(req);
  if (!authorized && bearer && bearer === serviceRoleKeyEarly) {
    authorized = true;
  }
  if (!authorized && bearer) {
    try {
      const userClient = createClient(supabaseUrlEarly, anonKeyEarly, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const admin = createClient(supabaseUrlEarly, serviceRoleKeyEarly);
        const { data: roles } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        const allowed = new Set(["admin", "supply_chain", "finance"]);
        if ((roles ?? []).some((r: { role: string }) => allowed.has(r.role))) {
          authorized = true;
        }
      }
    } catch (_e) { /* fall through to 401 */ }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    console.log("[sync] Starting paginated sync from WooCommerce REST API");

    if (!WC_KEY || !WC_SECRET) {
      throw new Error("WC_CONSUMER_KEY / WC_CONSUMER_SECRET not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body (all fields optional)
    let body: any = {};
    try { body = await req.json(); } catch (_) { /* no body */ }

    // Backwards compat: previous callers used `incremental: true` instead of `mode`.
    let mode: "backfill" | "incremental" | "manual" =
      body.mode === "backfill" || body.mode === "incremental" || body.mode === "manual"
        ? body.mode
        : (body.incremental ? "incremental" : "backfill");

    // For incremental/manual we look up `modified_after` from sync_state if
    // not explicitly provided. WooCommerce expects ISO 8601 without TZ
    // (treated as site timezone — close enough for a 15-min sync window).
    let modifiedAfter: string | null = body.modified_after || null;
    if ((mode === "incremental" || mode === "manual") && !modifiedAfter) {
      const { data: state } = await supabase
        .from("woocommerce_sync_state")
        .select("last_incremental_at")
        .eq("id", 1)
        .maybeSingle();
      if (state?.last_incremental_at) {
        // Subtract a 5-minute safety window to handle clock skew / late updates
        const t = new Date(new Date(state.last_incremental_at).getTime() - 5 * 60_000);
        modifiedAfter = t.toISOString().replace(/\.\d+Z$/, "");
      } else {
        // First incremental run ever — pull last 24h to seed
        const t = new Date(Date.now() - 24 * 60 * 60_000);
        modifiedAfter = t.toISOString().replace(/\.\d+Z$/, "");
      }
    }

    let page = Math.max(1, parseInt(body.start_page) || 1);
    const maxPages = Math.max(1, Math.min(parseInt(body.max_pages) || 10, 100));
    const endPage = page + maxPages - 1;
    const perPage = 100;
    const status = body.status || "any"; // ALL statuses by default
    const triggeredBy: string = body.triggered_by || (mode === "incremental" ? "cron" : "system");

    // Open a sync run row so the UI dashboard / audit can see what's happening.
    const { data: runRow } = await supabase
      .from("woocommerce_sync_runs")
      .insert({
        mode,
        status: "running",
        start_page: page,
        modified_after: modifiedAfter,
        triggered_by: triggeredBy,
      })
      .select("id")
      .single();
    const runId: string | null = runRow?.id || null;

    let hasMore = true;
    let totalFetched = 0;
    let totalUpserted = 0;
    let totalErrors = 0;
    let totalAvailable: number | null = null;
    const pageResults: string[] = [];

    while (hasMore) {
      const params = new URLSearchParams({
        per_page: String(perPage),
        page: String(page),
        status,
        orderby: "date",
        order: "desc",
      });
      if (modifiedAfter) params.set("modified_after", modifiedAfter);

      const url = `${WC_SITE_URL}/wp-json/wc/v3/orders?${params.toString()}`;
      console.log(`[sync] Fetching page ${page} (status=${status}${modifiedAfter ? `, modified_after=${modifiedAfter}` : ""})...`);

      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Accept: "application/json", Authorization: WC_AUTH },
        });
      } catch (fetchErr) {
        console.error(`[sync] Network error on page ${page}:`, fetchErr);
        pageResults.push(`Page ${page}: network error`);
        break;
      }

      if (!response.ok) {
        const txt = await response.text().catch(() => "");
        console.error(`[sync] WC REST returned ${response.status} on page ${page}: ${txt.slice(0, 200)}`);
        pageResults.push(`Page ${page}: HTTP ${response.status}`);
        break;
      }

      // Capture WC pagination headers on first page
      if (page === 1 || totalAvailable === null) {
        const t = response.headers.get("x-wp-total");
        if (t) totalAvailable = parseInt(t);
      }

      let orders: any[] = [];
      try {
        orders = await response.json();
        if (!Array.isArray(orders)) orders = [];
      } catch (parseErr) {
        console.error(`[sync] Parse error on page ${page}:`, parseErr);
        pageResults.push(`Page ${page}: parse error`);
        break;
      }

      console.log(`[sync] Page ${page}: got ${orders.length} orders (total available: ${totalAvailable ?? "?"})`);
      totalFetched += orders.length;

      if (orders.length > 0) {
        const mapped = orders.map(mapOrder).filter(Boolean);
        // Never overwrite an existing valid phone with null. If incoming phone
        // is null, drop the field from the upsert payload so the existing DB
        // value is preserved.
        for (const row of mapped as any[]) {
          if (row && (row.customer_phone === null || row.customer_phone === "")) {
            delete row.customer_phone;
          }
        }
        // The woocommerce_orders table has a per-row trigger
        // (handle_woocommerce_order_automation) that can be expensive,
        // so we keep chunks small (25) to stay well under the
        // PostgREST/PG statement_timeout. On chunk failure we retry
        // each row individually so one bad row doesn't kill 24 good ones.
        const CHUNK = 25;
        for (let i = 0; i < mapped.length; i += CHUNK) {
          const chunk = mapped.slice(i, i + CHUNK);
          const { error } = await supabase
            .from("woocommerce_orders")
            .upsert(chunk, { onConflict: "woo_order_id" });

          if (error) {
            console.warn(`[sync] Chunk upsert failed page ${page} offset ${i} (${chunk.length} rows): ${error.message}. Falling back to per-row.`);
            // Per-row fallback so one offender doesn't sink the chunk
            for (const row of chunk) {
              const { error: rowErr } = await supabase
                .from("woocommerce_orders")
                .upsert(row, { onConflict: "woo_order_id" });
              if (rowErr) {
                console.error(`[sync] Row upsert failed for woo_order_id=${(row as any).woo_order_id}: ${rowErr.message}`);
                totalErrors += 1;
              } else {
                totalUpserted += 1;
              }
            }
          } else {
            totalUpserted += chunk.length;
          }
        }
      }

      pageResults.push(`Page ${page}: ${orders.length} orders`);

      if (orders.length < perPage) {
        hasMore = false;
      } else {
        page++;
      }

      if (page > endPage) {
        console.log(`[sync] Reached batch limit (page ${endPage})`);
        break;
      }
    }

    const nextPage = hasMore ? page : null;
    console.log(`[sync] Done. Last page: ${page}, Fetched: ${totalFetched}, Upserted: ${totalUpserted}, Errors: ${totalErrors}, Total in WC: ${totalAvailable}, Next: ${nextPage}`);

    // Persist run + state
    const runStatus =
      totalErrors > 0 && totalUpserted === 0 ? "failed" :
      totalErrors > 0 ? "partial" : "success";

    if (runId) {
      await supabase
        .from("woocommerce_sync_runs")
        .update({
          status: runStatus,
          end_page: page,
          pages_fetched: pageResults.length,
          orders_fetched: totalFetched,
          orders_upserted: totalUpserted,
          errors: totalErrors,
          total_in_woocommerce: totalAvailable,
          next_page: nextPage,
          has_more: hasMore,
          message: hasMore
            ? `Batch ${page - pageResults.length + 1}-${page}: ${totalUpserted} upserted, more remaining`
            : `Sync complete: ${totalUpserted} orders across ${pageResults.length} pages`,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }

    // Update sync_state singleton
    const stateUpdate: Record<string, unknown> = {
      total_in_woocommerce: totalAvailable,
      updated_at: new Date().toISOString(),
    };
    if (mode === "incremental" || mode === "manual") {
      stateUpdate.last_incremental_at = new Date().toISOString();
    }
    if (mode === "backfill" && !hasMore) {
      stateUpdate.last_backfill_completed_at = new Date().toISOString();
    }
    if (mode === "backfill" && page === 1 + (pageResults.length ? 0 : 0) && body.start_page == null) {
      // First page of a backfill chain
      stateUpdate.last_backfill_started_at = new Date().toISOString();
    }
    // Recompute total_orders_synced via a count query
    const { count: dbCount } = await supabase
      .from("woocommerce_orders")
      .select("id", { count: "exact", head: true });
    if (typeof dbCount === "number") stateUpdate.total_orders_synced = dbCount;

    await supabase.from("woocommerce_sync_state").update(stateUpdate).eq("id", 1);

    // Self-chain backfills so the full history finishes without manual clicks.
    if (mode === "backfill" && hasMore && nextPage) {
      console.log(`[sync] Self-chaining backfill: invoking next batch at page ${nextPage}`);
      // Fire-and-forget; we don't await the response so this invocation
      // returns quickly and the next one runs in its own context.
      try {
        const fnUrl = `${supabaseUrl}/functions/v1/sync-website-orders`;
        // EdgeRuntime.waitUntil keeps the request alive in the background
        const p = fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            mode: "backfill",
            start_page: nextPage,
            max_pages: maxPages,
            triggered_by: triggeredBy,
          }),
        }).catch((e) => console.error("[sync] chain invoke error:", e));
        // @ts-ignore — EdgeRuntime is a Deno Deploy global
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(p);
        }
      } catch (e) {
        console.error("[sync] failed to schedule next chain:", e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        run_id: runId,
        mode,
        total_fetched: totalFetched,
        upserted: totalUpserted,
        errors: totalErrors,
        total_available_in_woocommerce: totalAvailable,
        pages_fetched: pageResults.length,
        next_page: nextPage,
        has_more: hasMore,
        page_results: pageResults,
        message: hasMore
          ? (mode === "backfill"
              ? `Synced ${totalUpserted} orders. Backfill continues in background from page ${nextPage}.`
              : `Synced ${totalUpserted} orders. Call again with start_page=${nextPage} to continue.`)
          : `Synced ${totalUpserted} orders across ${pageResults.length} pages (complete)`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[sync] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error", fallback: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
