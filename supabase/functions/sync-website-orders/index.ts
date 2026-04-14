import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[sync-website-orders] Starting sync from xboom.in API");

    const API_URL = "https://xboom.in/wp-json/xboom/v1/orders?token=xboom_default_secret_key_123";

    const response = await fetch(API_URL, {
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) {
      console.error(`[sync-website-orders] API returned ${response.status}`);
      return new Response(
        JSON.stringify({ success: false, message: `WordPress API error: ${response.status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // The WordPress response may have PHP notices/warnings before JSON
    let rawText = await response.text();
    console.log(`[sync-website-orders] Raw response length: ${rawText.length}`);
    
    // Strip PHP notices — find the first '[' or '{' which starts JSON
    const jsonStartBracket = rawText.indexOf('[');
    const jsonStartBrace = rawText.indexOf('{');
    let jsonStart = -1;
    if (jsonStartBracket >= 0 && jsonStartBrace >= 0) {
      jsonStart = Math.min(jsonStartBracket, jsonStartBrace);
    } else if (jsonStartBracket >= 0) {
      jsonStart = jsonStartBracket;
    } else if (jsonStartBrace >= 0) {
      jsonStart = jsonStartBrace;
    }

    if (jsonStart < 0) {
      console.error("[sync-website-orders] No JSON found in response");
      return new Response(
        JSON.stringify({ success: false, message: "No JSON data in API response" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (jsonStart > 0) {
      console.log(`[sync-website-orders] Stripping ${jsonStart} chars of PHP notices before JSON`);
      rawText = rawText.substring(jsonStart);
    }

    let orders: any[];
    try {
      const parsed = JSON.parse(rawText);
      // API may return { orders: [...] } or just [...]
      if (Array.isArray(parsed)) {
        orders = parsed;
      } else if (parsed.orders && Array.isArray(parsed.orders)) {
        orders = parsed.orders;
      } else if (parsed.data && Array.isArray(parsed.data)) {
        orders = parsed.data;
      } else {
        // Single object? Wrap it
        orders = [parsed];
      }
    } catch (parseErr) {
      console.error("[sync-website-orders] JSON parse error:", parseErr);
      console.log("[sync-website-orders] First 500 chars:", rawText.substring(0, 500));
      return new Response(
        JSON.stringify({ success: false, message: "Failed to parse API response" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sync-website-orders] Fetched ${orders.length} orders from API`);
    
    // Log first order keys for debugging
    if (orders.length > 0) {
      console.log("[sync-website-orders] First order keys:", Object.keys(orders[0]));
      console.log("[sync-website-orders] First order sample:", JSON.stringify(orders[0]).substring(0, 500));
    }

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let upserted = 0;
    let errors = 0;

    for (const order of orders) {
      try {
        const orderId = String(order.id || order.order_id || "");
        if (!orderId) continue;

        // Extract line items
        const lineItems = order.line_items || [];
        const firstItem = lineItems[0] || {};
        const productName = lineItems.length === 1
          ? (firstItem.name || order.product_name || "Unknown Product")
          : lineItems.length > 1
            ? `${firstItem.name || "Unknown"} + ${lineItems.length - 1} more`
            : (order.product_name || "Unknown Product");
        const totalQuantity = lineItems.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || order.quantity || 1;

        // Build shipping address
        const shipping = order.shipping || {};
        const shippingParts = [shipping.address_1, shipping.address_2, shipping.city, shipping.state, shipping.postcode, shipping.country].filter(Boolean);
        const shippingAddress = shippingParts.join(", ") || order.shipping_address || null;

        // Status mapping
        const wooStatus = order.status || "pending";
        const paymentStatusMap: Record<string, string> = {
          completed: "paid",
          processing: "paid",
          "on-hold": "pending",
          pending: "pending",
          failed: "failed",
          cancelled: "cancelled",
          refunded: "refunded",
        };

        // Customer info - try multiple field paths
        const billing = order.billing || {};
        const customerName = order.customer_name 
          || `${billing.first_name || ""} ${billing.last_name || ""}`.trim() 
          || order.customer 
          || "Unknown";
        const customerEmail = order.email || billing.email || order.customer_email || "";

        const total = parseFloat(order.total || order.amount || order.total_sales_amount || "0");

        const orderData = {
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

        const { error } = await supabase
          .from("woocommerce_orders")
          .upsert(orderData, { onConflict: "woo_order_id" });

        if (error) {
          console.error(`[sync-website-orders] Upsert error for #${orderId}:`, error.message);
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
        total_fetched: orders.length, 
        upserted, 
        errors,
        message: `Synced ${upserted} orders from xboom.in` 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[sync-website-orders] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
