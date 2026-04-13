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
    console.log("[woocommerce-webhook] Request received (auth: open, pending HMAC implementation)");

    const contentType = req.headers.get("content-type") || "";
    const topic = req.headers.get("x-wc-webhook-topic") || "unknown";

    // Handle form-encoded requests (WooCommerce ping/verification)
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = await req.text();
      console.log(`[woocommerce-webhook] Form-encoded ping received: ${body}`);
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse JSON payload
    const payload = await req.json();

    console.log(`[woocommerce-webhook] Received topic: ${topic}`);
    console.log(`[woocommerce-webhook] Order ID: ${payload?.id || "N/A"}, Status: ${payload?.status || "N/A"}`);

    // Initialize Supabase service client for DB writes
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle supported topics
    switch (topic) {
      case "order.created":
      case "order.updated": {
        const orderId = String(payload?.id || "");
        if (!orderId) {
          console.warn("[woocommerce-webhook] Missing order ID, skipping");
          break;
        }

        // Extract line items info
        const lineItems = payload?.line_items || [];
        const firstItem = lineItems[0] || {};
        const productName = lineItems.length === 1
          ? (firstItem.name || "Unknown Product")
          : `${firstItem.name || "Unknown"} + ${lineItems.length - 1} more`;
        const totalQuantity = lineItems.reduce((sum: number, item: { quantity?: number }) => sum + (item.quantity || 0), 0) || 1;

        // Build shipping address
        const shipping = payload?.shipping || {};
        const shippingParts = [shipping.address_1, shipping.address_2, shipping.city, shipping.state, shipping.postcode, shipping.country].filter(Boolean);
        const shippingAddress = shippingParts.join(", ") || null;

        // Map WooCommerce status to financial/payment status
        const wooStatus = payload?.status || "pending";
        const paymentStatusMap: Record<string, string> = {
          completed: "paid",
          processing: "paid",
          "on-hold": "pending",
          pending: "pending",
          failed: "failed",
          cancelled: "cancelled",
          refunded: "refunded",
        };

        const orderData = {
          woo_order_id: orderId,
          order_number: payload?.number ? String(payload.number) : orderId,
          source: "xboom_website",
          order_status: wooStatus,
          financial_status: wooStatus,
          fulfillment_status: wooStatus === "completed" ? "fulfilled" : "unfulfilled",
          product_name: productName,
          product_code: firstItem.sku || null,
          product_category: "Consumer Drones",
          quantity: totalQuantity,
          customer_name: `${payload?.billing?.first_name || ""} ${payload?.billing?.last_name || ""}`.trim() || "Unknown",
          customer_company: payload?.billing?.company || "",
          customer_email: payload?.billing?.email || "",
          customer_phone: payload?.billing?.phone || null,
          shipping_address: shippingAddress,
          selling_price: parseFloat(payload?.total || "0"),
          total_sales_amount: parseFloat(payload?.total || "0"),
          amount_paid: wooStatus === "completed" || wooStatus === "processing"
            ? parseFloat(payload?.total || "0")
            : 0,
          payment_status: paymentStatusMap[wooStatus] || "pending",
          currency: payload?.currency || "INR",
          line_items: lineItems,
          raw_data: payload,
          woo_created_at: payload?.date_created || null,
          woo_updated_at: payload?.date_modified || null,
        };

        // Upsert — insert or update on duplicate woo_order_id
        const { error } = await supabase
          .from("woocommerce_orders")
          .upsert(orderData, { onConflict: "woo_order_id" });

        if (error) {
          console.error(`[woocommerce-webhook] DB upsert error for order #${orderId}:`, error.message);
        } else {
          const action = topic === "order.created" ? "Inserted" : "Upserted";
          console.log(`[woocommerce-webhook] ${action} order #${orderId} — ${productName}, Total: ${payload?.total}, Customer: ${orderData.customer_name}`);
        }
        break;
      }

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
