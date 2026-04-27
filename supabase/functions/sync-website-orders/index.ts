import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Use the official WooCommerce REST API (v3) with Basic auth.
// status=any returns ALL statuses including custom ones (delivered,
// return-requested, return-approved, return-cancelled, etc.) — no
// filtering, no transforms. We store the raw WooCommerce status.
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
    customer_phone: billing.phone || null,
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

  try {
    console.log("[sync] Starting paginated sync from WooCommerce REST API");

    if (!WC_KEY || !WC_SECRET) {
      throw new Error("WC_CONSUMER_KEY / WC_CONSUMER_SECRET not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Bound the work so we don't hit the edge-runtime idle timeout.
    // Defaults: 20 pages (2000 orders) per invocation; caller passes
    // start_page to continue, or `modified_after` for incremental syncs.
    let body: any = {};
    try { body = await req.json(); } catch (_) { /* no body */ }

    let page = Math.max(1, parseInt(body.start_page) || 1);
    const maxPages = Math.max(1, Math.min(parseInt(body.max_pages) || 20, 100));
    const endPage = page + maxPages - 1;
    const perPage = 100;
    const status = body.status || "any"; // ALL statuses by default
    const modifiedAfter: string | null = body.modified_after || null; // ISO 8601, no TZ

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
        for (let i = 0; i < mapped.length; i += 500) {
          const chunk = mapped.slice(i, i + 500);
          const { error } = await supabase
            .from("woocommerce_orders")
            .upsert(chunk, { onConflict: "woo_order_id" });

          if (error) {
            console.error(`[sync] Upsert error page ${page} chunk ${i}:`, error.message);
            totalErrors += chunk.length;
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

    return new Response(
      JSON.stringify({
        success: true,
        total_fetched: totalFetched,
        upserted: totalUpserted,
        errors: totalErrors,
        total_available_in_woocommerce: totalAvailable,
        pages_fetched: page,
        next_page: nextPage,
        has_more: hasMore,
        page_results: pageResults,
        message: hasMore
          ? `Synced ${totalUpserted} orders. Call again with start_page=${nextPage} to continue.`
          : `Synced ${totalUpserted} orders across ${page} pages (complete)`,
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
