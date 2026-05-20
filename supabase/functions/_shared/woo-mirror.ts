/**
 * Shared helper: mirror a WooCommerce order payload into the internal
 * `orders` table. Used by both `woocommerce-webhook` (real-time) and
 * `woocommerce-orders-backfill` (cron / manual).
 */

// Map WooCommerce status -> internal orders.status enum value
export function mapWooStatusToInternal(wooStatus: string): string {
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

/**
 * Pull tracking number + URL out of a Woo order payload. Looks at the
 * common locations used by Advanced Shipment Tracking, YITH, WC Shipment
 * Tracking, and the generic meta_data array.
 */
// deno-lint-ignore no-explicit-any
export function extractTrackingFromWoo(payload: any): { number: string | null; url: string | null } {
  let number: string | null = null;
  let url: string | null = null;

  const meta = Array.isArray(payload?.meta_data) ? payload.meta_data : [];
  for (const m of meta) {
    const k = String(m?.key || "").toLowerCase();
    const v = m?.value;
    if (!v) continue;
    if (!number && /tracking[_-]?(number|no|id)$/.test(k)) number = String(v);
    if (!url && /tracking[_-]?(url|link)$/.test(k)) url = String(v);
    if (!number && k === "_wc_shipment_tracking_items" && Array.isArray(v) && v[0]) {
      number = v[0].tracking_number || null;
      url = url || v[0].tracking_url || null;
    }
  }
  if (!number && payload?.tracking_number) number = String(payload.tracking_number);
  if (!url && payload?.tracking_url) url = String(payload.tracking_url);
  return { number, url };
}

// Only orders dated this day or later may land in the internal `orders` table.
export const WINDOW_START_ISO = "2026-04-30";

// System "website" sales user (admin) — required by NOT NULL FK columns.
const SYSTEM_USER_ID = "a8050cc3-7d17-44ac-a083-d8023d505331";
const SYSTEM_USER_NAME = "Website (Auto)";

// Send a Slack notification to the #all-xboom-2025 channel when a new
// website order lands. Failures are swallowed — Slack must never block
// order ingestion.
async function notifySlackWebsiteOrder(orderRow: Record<string, unknown>, orderId: string) {
  try {
    const botToken = Deno.env.get("SLACK_BOT_TOKEN");
    if (!botToken) {
      console.warn("[woo-mirror] SLACK_BOT_TOKEN not set, skipping Slack notify");
      return;
    }
    const channel = "all-xboom-2025";
    const formatINR = (n: number) => `₹${(n || 0).toLocaleString("en-IN")}`;
    const message = {
      channel,
      text: `🛒 New Website Order #${orderRow.order_number} from ${orderRow.customer_name}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "🛒 New Website Order Received!", emoji: true },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `A new *Website Order* has been placed on the Xboom website.`,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*📋 Order #:*\n\`${orderRow.order_number}\`` },
            { type: "mrkdwn", text: `*👤 Customer:*\n${orderRow.customer_name}` },
            { type: "mrkdwn", text: `*📦 Product:*\n${orderRow.product_name}` },
            { type: "mrkdwn", text: `*🔢 Quantity:*\n${orderRow.quantity} units` },
            { type: "mrkdwn", text: `*💰 Order Value:*\n${formatINR(orderRow.total_sales_amount as number)}` },
            { type: "mrkdwn", text: `*🌐 Source:*\nXboom Website` },
          ],
        },
        { type: "divider" },
      ],
    };
    const resp = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${botToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(message),
    });
    const result = await resp.json();
    if (!result.ok) {
      console.error(`[woo-mirror] Slack notify failed for order ${orderId}: ${result.error}`);
    }
  } catch (err) {
    console.error(`[woo-mirror] Slack notify exception for order ${orderId}:`, err);
  }
}

// deno-lint-ignore no-explicit-any
export async function mirrorIntoInternalOrders(supabase: any, payload: any, orderId: string, eventType: string) {
  const wooStatus: string = (payload?.status || "").toLowerCase();
  const lineItems = payload?.line_items || [];

  const orderDateRaw: string = String(payload?.date_created || "").slice(0, 10);
  const inWindow = !!orderDateRaw && orderDateRaw >= WINDOW_START_ISO;

  const { data: existing, error: lookupErr } = await supabase
    .from("orders")
    .select("id, status, source")
    .eq("external_id", String(orderId))
    .maybeSingle();

  if (lookupErr) {
    await supabase.from("woo_sync_logs").insert({
      woo_order_id: orderId, event_type: eventType, direction: "in",
      status: "failed", woo_status: wooStatus,
      error_message: `lookup error: ${lookupErr.message}`,
    });
    return;
  }

  if (!existing && (wooStatus !== "processing" || !inWindow)) {
    await supabase.from("woo_sync_logs").insert({
      woo_order_id: orderId, event_type: eventType, direction: "in",
      status: "skipped", woo_status: wooStatus,
      error_message: !inWindow
        ? `Order date ${orderDateRaw} before window ${WINDOW_START_ISO}`
        : `Status '${wooStatus}' not 'processing' and no existing internal order`,
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
  const rawPhone = (billing.phone ?? shipping.phone ?? "").toString().trim();
  const customerPhone: string | null = rawPhone.length > 0 ? rawPhone : null;

  const totalAmount = parseFloat(payload?.total || "0");
  const totalQty = lineItems.reduce(
    (s: number, it: { quantity?: number }) => s + (it.quantity || 0), 0,
  ) || 1;
  const firstItem = lineItems[0] || {};
  const productName = lineItems.length === 1
    ? (firstItem.name || "Website Order")
    : `${firstItem.name || "Website Order"} + ${lineItems.length - 1} more`;
  const productCode: string = (firstItem.sku || `WOO-${orderId}`).toString();

  const internalStatus = mapWooStatusToInternal(wooStatus);
  const isPaid = wooStatus === "processing" || wooStatus === "completed" || wooStatus === "delivered";
  const wooTracking = extractTrackingFromWoo(payload);

  const orderRow: Record<string, unknown> = {
    external_id: String(orderId),
    source: "website",
    order_number: payload?.number ? String(payload.number) : `WOO-${orderId}`,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    customer_company: billing.company || null,
    product_name: productName,
    product_code: productCode,
    product_category: "Consumer Drones",
    quantity: totalQty,
    selling_price: totalAmount,
    total_sales_amount: totalAmount,
    amount_paid: isPaid ? totalAmount : 0,
    payment_status: isPaid ? "full" : "pending",
    shipping_address: shippingAddress,
    payment_terms: payload?.payment_method_title || payload?.payment_method || null,
    lead_source: "website",
    order_type: "prepaid",
    status: internalStatus,
    order_date: orderDateRaw || new Date().toISOString().slice(0, 10),
    sales_person_id: SYSTEM_USER_ID,
    sales_person_name: SYSTEM_USER_NAME,
    created_by: SYSTEM_USER_ID,
  };

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
    const { data: cur } = await supabase
      .from("orders").select("tracking_number, tracking_url")
      .eq("id", existing.id).maybeSingle();
    if (!cur?.tracking_number && wooTracking.number) orderRow.tracking_number = wooTracking.number;
    if (!cur?.tracking_url && wooTracking.url) orderRow.tracking_url = wooTracking.url;
    const { error: updErr } = await supabase
      .from("orders").update(orderRow).eq("id", existing.id);
    if (updErr) {
      await supabase.from("woo_sync_logs").insert({
        woo_order_id: orderId, internal_order_id: existing.id,
        event_type: eventType, direction: "in", status: "failed",
        woo_status: wooStatus, error_message: `update error: ${updErr.message}`,
      });
      return;
    }
  } else {
    if (wooTracking.number) orderRow.tracking_number = wooTracking.number;
    if (wooTracking.url) orderRow.tracking_url = wooTracking.url;
    const { data: ins, error: insErr } = await supabase
      .from("orders").insert(orderRow).select("id").single();
    if (insErr) {
      await supabase.from("woo_sync_logs").insert({
        woo_order_id: orderId, event_type: eventType, direction: "in",
        status: "failed", woo_status: wooStatus,
        error_message: `insert error: ${insErr.message}`,
      });
      return;
    }
    internalId = ins.id;
    // New website order created — notify Slack channel #all-xboom-2025
    await notifySlackWebsiteOrder(orderRow, orderId);
  }

  if (internalId) {
    await supabase.from("order_items").delete().eq("order_id", internalId);
    if (lineItems.length > 0) {
      // deno-lint-ignore no-explicit-any
      const items = lineItems.map((li: any) => ({
        order_id: internalId,
        product_name: li.name || "Item",
        product_code: li.sku || null,
        product_category: "Consumer Drones",
        quantity: li.quantity || 1,
        unit_price: parseFloat(li.price || li.subtotal || "0") || 0,
      }));
      const { error: itErr } = await supabase.from("order_items").insert(items);
      if (itErr) console.error("[woo-mirror] order_items insert err", itErr.message);
    }
  }

  await supabase.from("woo_sync_logs").insert({
    woo_order_id: orderId, internal_order_id: internalId,
    event_type: eventType, direction: "in", status: "success",
    woo_status: wooStatus,
  });
}