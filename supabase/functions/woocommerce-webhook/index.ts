import { createClient } from "npm:@supabase/supabase-js@2";
import { mirrorIntoInternalOrders, extractTrackingFromWoo } from "../_shared/woo-mirror.ts";
export { mirrorIntoInternalOrders } from "../_shared/woo-mirror.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wc-webhook-topic, x-wc-webhook-signature, x-wc-webhook-source, xboom_secret",
};

// HMAC-SHA256 base64 of raw body using WOOCOMMERCE_WEBHOOK_SECRET
async function verifyWooSignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
  // constant-time compare
  if (computed.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

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
    const contentType = req.headers.get("content-type") || "";
    const topic = req.headers.get("x-wc-webhook-topic") || "unknown";
    const signature = req.headers.get("x-wc-webhook-signature");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle form-encoded requests (WooCommerce ping/verification)
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = await req.text();
      console.log(`[woocommerce-webhook] Form-encoded ping received: ${body}`);
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read raw body for HMAC verification BEFORE parsing
    const rawBody = await req.text();

    // HMAC verify (skip only when secret not configured — keeps backward compat for setup)
    const hmacSecret = Deno.env.get("WOOCOMMERCE_WEBHOOK_SECRET");
    if (!hmacSecret) {
      console.error("[woocommerce-webhook] WOOCOMMERCE_WEBHOOK_SECRET not configured — rejecting");
      return new Response(JSON.stringify({ success: false, error: "server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    {
      const ok = await verifyWooSignature(rawBody, signature, hmacSecret);
      if (!ok) {
        console.warn("[woocommerce-webhook] HMAC verification FAILED");
        await supabase.from("woo_sync_logs").insert({
          event_type: "hmac_fail",
          direction: "in",
          status: "failed",
          error_message: "Invalid HMAC signature",
          payload: { topic, has_sig: !!signature },
        });
        return new Response(JSON.stringify({ success: false, error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const payload = JSON.parse(rawBody);

    console.log(`[woocommerce-webhook] Received topic: ${topic}`);
    console.log(`[woocommerce-webhook] Order ID: ${payload?.id || "N/A"}, Status: ${payload?.status || "N/A"}`);

    // Only handle order.* events. Cart/abandoned plugin topics are no longer supported.
    if (topic === "order.created" || topic === "order.updated") {
        const orderId = String(payload?.id || "");
        if (!orderId) {
          console.warn("[woocommerce-webhook] Missing order ID, skipping");
        } else {
          await processOrder(supabase, payload, orderId, topic);
          await mirrorIntoInternalOrders(supabase, payload, orderId, "webhook_in");
        }
    } else {
      console.log(`[woocommerce-webhook] Ignoring unsupported topic: ${topic}`);
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

// deno-lint-ignore no-explicit-any
async function processOrder(supabase: any, payload: any, orderId: string, topic: string) {
  const lineItems = payload?.line_items || [];
  const firstItem = lineItems[0] || {};
  const productName = lineItems.length === 1
    ? (firstItem.name || "Unknown Product")
    : `${firstItem.name || "Unknown"} + ${lineItems.length - 1} more`;
  const totalQuantity = lineItems.reduce(
    (sum: number, item: { quantity?: number }) => sum + (item.quantity || 0),
    0,
  ) || 1;

  const shipping = payload?.shipping || {};
  const shippingParts = [
    shipping.address_1, shipping.address_2, shipping.city,
    shipping.state, shipping.postcode, shipping.country,
  ].filter(Boolean);
  const shippingAddress = shippingParts.join(", ") || null;

  const wooStatus: string = payload?.status || "pending";
  console.log(`[woocommerce-webhook] Status="${wooStatus}" order_id=${orderId}`);

  const paymentStatusMap: Record<string, string> = {
    completed: "paid",
    processing: "paid",
    delivered: "paid",
    "on-hold": "pending",
    pending: "pending",
    failed: "failed",
    cancelled: "cancelled",
    refunded: "refunded",
  };

  const isPaid = wooStatus === "completed" || wooStatus === "processing" || wooStatus === "delivered";
  const orderTotal = parseFloat(payload?.total || "0");

  const rawPhone = (payload?.billing?.phone ?? payload?.shipping?.phone ?? "").toString().trim();
  const phone: string | null = rawPhone.length > 0 ? rawPhone : null;
  console.log(`[woocommerce-webhook] order ${orderId} phone="${phone ?? ""}"`);

  const orderData: Record<string, unknown> = {
    woo_order_id: orderId,
    order_number: payload?.number ? String(payload.number) : orderId,
    source: "xboom_website",
    order_status: wooStatus,
    financial_status: wooStatus,
    fulfillment_status: (wooStatus === "completed" || wooStatus === "delivered") ? "fulfilled" : "unfulfilled",
    product_name: productName,
    product_code: firstItem.sku || null,
    product_category: "Consumer Drones",
    quantity: totalQuantity,
    customer_name: `${payload?.billing?.first_name || ""} ${payload?.billing?.last_name || ""}`.trim() || "Unknown",
    customer_company: payload?.billing?.company || "",
    customer_email: payload?.billing?.email || "",
    shipping_address: shippingAddress,
    selling_price: orderTotal,
    total_sales_amount: orderTotal,
    amount_paid: isPaid ? orderTotal : 0,
    payment_status: paymentStatusMap[wooStatus] || "pending",
    currency: payload?.currency || "INR",
    line_items: lineItems,
    raw_data: payload,
    woo_created_at: payload?.date_created || null,
    woo_updated_at: payload?.date_modified || null,
  };
  // Only include phone in upsert when present — preserves existing valid phone.
  if (phone !== null) orderData.customer_phone = phone;

  // Pull tracking info written by the WooCommerce Shipment Tracking plugin
  // (or any compatible meta) and mirror it onto woocommerce_orders so the
  // Website Orders UI shows the same tracking the customer sees.
  const trk = extractTrackingFromWoo(payload);
  if (trk.number) {
    orderData.tracking_number = trk.number;
    if (trk.provider) orderData.courier = trk.provider;
    if (trk.date_shipped) orderData.expected_delivery = trk.date_shipped;
    if (!orderData.tracking_status) {
      orderData.tracking_status =
        (wooStatus === "completed" || wooStatus === "delivered") ? "delivered" : "in_transit";
    }
  } else if (trk.cleared) {
    // Tracking was explicitly deleted in WooCommerce — clear the mirror.
    orderData.tracking_number = null;
    orderData.courier = null;
    orderData.expected_delivery = null;
    orderData.tracking_status = null;
  }

  // UPSERT keyed on woo_order_id — same row moves between buckets when status changes.
  const { error } = await supabase
    .from("woocommerce_orders")
    .upsert(orderData, { onConflict: "woo_order_id" });

  if (error) {
    console.error(`[woocommerce-webhook] DB upsert error for order #${orderId}:`, error.message);
    return;
  }

  const action = topic === "order.created" ? "Created" : "Updated";
  console.log(
    `[woocommerce-webhook] ${action} order #${orderId} — status=${wooStatus}, total=${orderTotal}`,
  );
}
