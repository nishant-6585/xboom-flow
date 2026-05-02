import { createClient } from "npm:@supabase/supabase-js@2";

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
    if (hmacSecret) {
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
    } else {
      console.warn("[woocommerce-webhook] WOOCOMMERCE_WEBHOOK_SECRET not set — skipping HMAC (DEV ONLY)");
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

// Map WooCommerce status -> internal orders.status enum value
// Internal enum: po_received, payment_received, partial_payment_received,
// procurement_to_plan, procurement_in_process, procurement_done,
// delivery_done, cancelled, to_ship, in_transit
function mapWooStatusToInternal(wooStatus: string): string {
  switch (wooStatus) {
    case "processing": return "payment_received";
    case "completed":
    case "delivered": return "delivery_done";
    case "cancelled": return "cancelled";
    case "refunded": return "cancelled";
    case "on-hold": return "po_received";
    default: return "po_received";
  }
}

// deno-lint-ignore no-explicit-any
export async function mirrorIntoInternalOrders(supabase: any, payload: any, orderId: string, eventType: string) {
  const wooStatus: string = (payload?.status || "").toLowerCase();
  const lineItems = payload?.line_items || [];

  // Look up existing internal row by external_id
  const { data: existing, error: lookupErr } = await supabase
    .from("orders")
    .select("id, status, source")
    .eq("external_id", String(orderId))
    .maybeSingle();

  if (lookupErr) {
    await supabase.from("woo_sync_logs").insert({
      woo_order_id: orderId,
      event_type: eventType,
      direction: "in",
      status: "failed",
      woo_status: wooStatus,
      error_message: `lookup error: ${lookupErr.message}`,
    });
    return;
  }

  // RULE: only CREATE when processing. Updates flow even when status leaves processing,
  // but only if the row already exists (created earlier from a processing event).
  if (!existing && wooStatus !== "processing") {
    await supabase.from("woo_sync_logs").insert({
      woo_order_id: orderId,
      event_type: eventType,
      direction: "in",
      status: "skipped",
      woo_status: wooStatus,
      error_message: `Status '${wooStatus}' not 'processing' and no existing internal order`,
    });
    return;
  }

  const billing = payload?.billing || {};
  const shipping = payload?.shipping || {};
  const shippingParts = [
    shipping.address_1, shipping.address_2, shipping.city,
    shipping.state, shipping.postcode, shipping.country,
  ].filter(Boolean);
  const shippingAddress = shippingParts.join(", ") || null;

  const customerName = `${billing.first_name || ""} ${billing.last_name || ""}`.trim() || "Website Customer";
  const customerEmail = billing.email || null;
  const customerPhone = (billing.phone || shipping.phone || "").toString().trim() || null;

  const totalAmount = parseFloat(payload?.total || "0");
  const totalQty = lineItems.reduce(
    (s: number, it: { quantity?: number }) => s + (it.quantity || 0), 0
  ) || 1;
  const firstItem = lineItems[0] || {};
  const productName = lineItems.length === 1
    ? (firstItem.name || "Website Order")
    : `${firstItem.name || "Website Order"} + ${lineItems.length - 1} more`;

  const internalStatus = mapWooStatusToInternal(wooStatus);
  const isPaid = wooStatus === "processing" || wooStatus === "completed" || wooStatus === "delivered";

  const orderRow: Record<string, unknown> = {
    external_id: String(orderId),
    source: "website",
    order_number: payload?.number ? String(payload.number) : `WOO-${orderId}`,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_company: billing.company || null,
    product_name: productName,
    product_category: "Consumer Drones",
    quantity: totalQty,
    selling_price: totalAmount,
    total_sales_amount: totalAmount,
    amount_paid: isPaid ? totalAmount : 0,
    payment_status: isPaid ? "paid" : "pending",
    shipping_address: shippingAddress,
    payment_terms: payload?.payment_method_title || payload?.payment_method || null,
    lead_source: "website",
    order_type: "website",
    status: internalStatus,
    order_date: payload?.date_created ? String(payload.date_created).slice(0, 10) : new Date().toISOString().slice(0, 10),
  };

  // Apply lifecycle side-effects
  if (wooStatus === "cancelled") {
    orderRow.cancelled_at = new Date().toISOString();
    orderRow.cancellation_reason = "Cancelled on WooCommerce";
    orderRow.order_outcome = "OL";
    orderRow.lost_reason = "Customer cancelled on website";
  }
  if (wooStatus === "refunded") {
    orderRow.refund_status = "refunded";
    orderRow.refund_requested_at = new Date().toISOString();
    orderRow.refund_reason = "Refunded on WooCommerce";
  }
  if (wooStatus === "delivered" || wooStatus === "completed") {
    orderRow.actual_delivery = new Date().toISOString().slice(0, 10);
    orderRow.order_outcome = "OW";
  }

  let internalId: string | null = existing?.id ?? null;
  if (existing) {
    const { error: updErr } = await supabase
      .from("orders")
      .update(orderRow)
      .eq("id", existing.id);
    if (updErr) {
      await supabase.from("woo_sync_logs").insert({
        woo_order_id: orderId, internal_order_id: existing.id,
        event_type: eventType, direction: "in", status: "failed",
        woo_status: wooStatus, error_message: `update error: ${updErr.message}`,
      });
      return;
    }
  } else {
    const { data: ins, error: insErr } = await supabase
      .from("orders")
      .insert(orderRow)
      .select("id")
      .single();
    if (insErr) {
      await supabase.from("woo_sync_logs").insert({
        woo_order_id: orderId,
        event_type: eventType, direction: "in", status: "failed",
        woo_status: wooStatus, error_message: `insert error: ${insErr.message}`,
      });
      return;
    }
    internalId = ins.id;
  }

  // Sync order_items: replace-all strategy keyed on order_id (simple + correct)
  if (internalId) {
    await supabase.from("order_items").delete().eq("order_id", internalId);
    if (lineItems.length > 0) {
      const items = lineItems.map((li: any) => ({
        order_id: internalId,
        product_name: li.name || "Item",
        product_code: li.sku || null,
        product_category: "Consumer Drones",
        quantity: li.quantity || 1,
        unit_price: parseFloat(li.price || li.subtotal || "0") || 0,
      }));
      const { error: itErr } = await supabase.from("order_items").insert(items);
      if (itErr) console.error("[woocommerce-webhook] order_items insert err", itErr.message);
    }
  }

  await supabase.from("woo_sync_logs").insert({
    woo_order_id: orderId,
    internal_order_id: internalId,
    event_type: eventType,
    direction: "in",
    status: "success",
    woo_status: wooStatus,
  });
}

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
