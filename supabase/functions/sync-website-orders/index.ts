import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const API_URL = "https://xboom.in/wp-json/xboom/v1/orders?token=xboom_default_secret_key_123";

function stripPhpNotices(raw: string): string {
  const b = raw.indexOf('[');
  const c = raw.indexOf('{');
  let start = -1;
  if (b >= 0 && c >= 0) start = Math.min(b, c);
  else if (b >= 0) start = b;
  else if (c >= 0) start = c;
  if (start > 0) {
    console.log(`[sync-website-orders] Stripped ${start} chars of PHP notices`);
    return raw.substring(start);
  }
  if (start < 0) throw new Error("No JSON found in API response");
  return raw;
}

function parseOrders(raw: string): any[] {
  const cleaned = stripPhpNotices(raw);
  const parsed = JSON.parse(cleaned);
  if (Array.isArray(parsed)) return parsed;
  if (parsed.orders && Array.isArray(parsed.orders)) return parsed.orders;
  if (parsed.data && Array.isArray(parsed.data)) return parsed.data;
  return [parsed];
}

function mapOrder(order: any) {
  const orderId = String(order.id || order.order_id || "");
  if (!orderId) return null;

  const lineItems = order.line_items || [];
  const firstItem = lineItems[0] || {};
  const productName = lineItems.length === 1
    ? (firstItem.name || order.product_name || "Unknown Product")
    : lineItems.length > 1
      ? `${firstItem.name || "Unknown"} + ${lineItems.length - 1} more`
      : (order.product_name || "Unknown Product");
  const totalQuantity = lineItems.reduce((s: number, i: any) => s + (i.quantity || 0), 0) || order.quantity || 1;

  const shipping = order.shipping || {};
  const shippingParts = [shipping.address_1, shipping.address_2, shipping.city, shipping.state, shipping.postcode, shipping.country].filter(Boolean);
  const shippingAddress = shippingParts.join(", ") || order.shipping_address || null;

  const wooStatus = order.status || "pending";
  const paymentStatusMap: Record<string, string> = {
    completed: "paid", processing: "paid", "on-hold": "pending",
    pending: "pending", failed: "failed", cancelled: "cancelled", refunded: "refunded",
  };

  const billing = order.billing || {};
  const customerName = order.customer_name
    || `${billing.first_name || ""} ${billing.last_name || ""}`.trim()
    || order.customer || "Unknown";
  const customerEmail = order.email || billing.email || order.customer_email || "";
  const total = parseFloat(order.total || order.amount || order.total_sales_amount || "0");

  return {
    woo_order_id: orderId,
    order_number: order.number ? String(order.number) : order.order_number || orderId,
    source: "xboom_website",
    order_status: wooStatus,
    financial_status: wooStatus,
    fulfillment_status: wooStatus === "completed" ? "fulfilled" : "unfulfilled",
    product_name: productName,
    product_code: firstItem.sku || order.product_code || null,
    product_category: order.product_category || "Consumer Drones",
    quantity: totalQuantity,
    customer_name: customerName,
    customer_company: billing.company || order.customer_company || "",
    customer_email: customerEmail,
    customer_phone: billing.phone || order.customer_phone || null,
    shipping_address: shippingAddress,
    selling_price: total,
    total_sales_amount: total,
    amount_paid: (wooStatus === "completed" || wooStatus === "processing") ? total : 0,
    payment_status: paymentStatusMap[wooStatus] || "pending",
    currency: order.currency || "INR",
    line_items: lineItems.length > 0 ? lineItems : null,
    raw_data: order,
    woo_created_at: order.date_created || order.created_at || null,
    woo_updated_at: order.date_modified || order.updated_at || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[sync-website-orders] Starting sync from xboom.in API");

    let response: Response;
    try {
      response = await fetch(API_URL, { headers: { Accept: "application/json" } });
    } catch (fetchErr) {
      console.error("[sync-website-orders] Network error:", fetchErr);
      return new Response(
        JSON.stringify({ success: false, error: "Network error reaching xboom.in", fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!response.ok) {
      console.error(`[sync-website-orders] API returned ${response.status}`);
      return new Response(
        JSON.stringify({ success: false, error: `WordPress API error: ${response.status}`, fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawText = await response.text();
    console.log(`[sync-website-orders] Raw response length: ${rawText.length}`);

    let allOrders: any[];
    try {
      allOrders = parseOrders(rawText);
    } catch (parseErr) {
      console.error("[sync-website-orders] Parse error:", parseErr);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to parse API response", fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sync-website-orders] Fetched ${allOrders.length} orders from API`);

    if (allOrders.length > 0) {
      console.log("[sync-website-orders] First order keys:", Object.keys(allOrders[0]));
    }

    if (allOrders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, total_fetched: 0, upserted: 0, errors: 0, message: "No orders found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let upserted = 0;
    let errors = 0;

    for (const order of allOrders) {
      try {
        const orderData = mapOrder(order);
        if (!orderData) continue;

        const { error } = await supabase
          .from("woocommerce_orders")
          .upsert(orderData, { onConflict: "woo_order_id" });

        if (error) {
          console.error(`[sync-website-orders] Upsert error #${orderData.woo_order_id}:`, error.message);
          errors++;
        } else {
          upserted++;
        }
      } catch (itemErr) {
        console.error("[sync-website-orders] Order processing error:", itemErr);
        errors++;
      }
    }

    console.log(`[sync-website-orders] Done. Upserted: ${upserted}, Errors: ${errors}`);

    return new Response(
      JSON.stringify({
        success: true,
        total_fetched: allOrders.length,
        upserted,
        errors,
        message: `Synced ${upserted} orders from xboom.in`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[sync-website-orders] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error", fallback: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
