import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://xboom.in/wp-json/xboom/v1/orders";
const TOKEN = "xboom_default_secret_key_123";

function stripPhpNotices(raw: string): string {
  const b = raw.indexOf('[');
  const c = raw.indexOf('{');
  let start = -1;
  if (b >= 0 && c >= 0) start = Math.min(b, c);
  else if (b >= 0) start = b;
  else if (c >= 0) start = c;
  if (start > 0) {
    console.log(`[sync] Stripped ${start} chars of PHP notices`);
    return raw.substring(start);
  }
  if (start < 0) throw new Error("No JSON found in API response");
  return raw;
}

function mapOrder(order: any) {
  const orderId = String(order.id || "");
  if (!orderId) return null;

  const customerName = order.customer_name || order.email || "Unknown";
  const email = order.email || "";
  const productNames = order.product_names || "Unknown Product";
  const total = parseFloat(order.total || "0");
  const status = order.status || "pending";

  const paymentStatusMap: Record<string, string> = {
    completed: "paid", processing: "paid", "on-hold": "pending",
    pending: "pending", failed: "failed", cancelled: "cancelled", refunded: "refunded",
  };

  return {
    woo_order_id: orderId,
    order_number: orderId,
    source: "xboom_website",
    order_status: status,
    financial_status: status,
    fulfillment_status: status === "completed" ? "fulfilled" : "unfulfilled",
    product_name: productNames,
    product_code: null,
    product_category: "Consumer Drones",
    quantity: order.items_count || 1,
    customer_name: customerName,
    customer_company: "",
    customer_email: email,
    customer_phone: null,
    shipping_address: null,
    selling_price: total,
    total_sales_amount: total,
    amount_paid: (status === "completed" || status === "processing") ? total : 0,
    payment_status: paymentStatusMap[status] || "pending",
    currency: "INR",
    line_items: null,
    raw_data: order,
    internal_notes: order.payment_method_title ? `Payment: ${order.payment_method_title}` : null,
    woo_created_at: order.created_at || null,
    woo_updated_at: null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[sync] Starting paginated sync from xboom.in API");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Allow caller to bound the work so we don't hit the 150s idle timeout.
    // Defaults: process up to 20 pages (2000 orders) per invocation.
    let body: any = {};
    try { body = await req.json(); } catch (_) { /* no body */ }
    let page = Math.max(1, parseInt(body.start_page) || 1);
    const maxPages = Math.max(1, Math.min(parseInt(body.max_pages) || 20, 100));
    const endPage = page + maxPages - 1;
    const perPage = 100;
    let hasMore = true;
    let totalFetched = 0;
    let totalUpserted = 0;
    let totalErrors = 0;
    const pageResults: string[] = [];

    while (hasMore) {
      const url = `${BASE_URL}?token=${TOKEN}&page=${page}&per_page=${perPage}`;
      console.log(`[sync] Fetching page ${page}...`);

      let response: Response;
      try {
        response = await fetch(url, { headers: { Accept: "application/json" } });
      } catch (fetchErr) {
        console.error(`[sync] Network error on page ${page}:`, fetchErr);
        pageResults.push(`Page ${page}: network error`);
        break;
      }

      if (!response.ok) {
        console.error(`[sync] API returned ${response.status} on page ${page}`);
        pageResults.push(`Page ${page}: HTTP ${response.status}`);
        break;
      }

      const rawText = await response.text();
      let parsed: any;
      try {
        const cleaned = stripPhpNotices(rawText);
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        console.error(`[sync] Parse error on page ${page}:`, parseErr);
        pageResults.push(`Page ${page}: parse error`);
        break;
      }

      // Handle the documented response format: { success, page, per_page, count, data: [...] }
      if (parsed.success === false) {
        console.error(`[sync] API returned success=false on page ${page}`);
        pageResults.push(`Page ${page}: API error`);
        break;
      }

      const orders = Array.isArray(parsed.data) ? parsed.data
        : Array.isArray(parsed) ? parsed
        : parsed.orders ? parsed.orders
        : [];

      console.log(`[sync] Page ${page}: got ${orders.length} orders`);
      totalFetched += orders.length;

      // Batch upsert this page
      if (orders.length > 0) {
        const mapped = orders.map(mapOrder).filter(Boolean);

        // Upsert in chunks of 500
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

      // Stop after the requested batch to avoid edge-runtime idle timeout.
      if (page > endPage) {
        console.log(`[sync] Reached batch limit (page ${endPage})`);
        break;
      }
    }

    const nextPage = hasMore ? page : null;
    console.log(`[sync] Done. Last page: ${page}, Fetched: ${totalFetched}, Upserted: ${totalUpserted}, Errors: ${totalErrors}, Next: ${nextPage}`);

    return new Response(
      JSON.stringify({
        success: true,
        total_fetched: totalFetched,
        upserted: totalUpserted,
        errors: totalErrors,
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
