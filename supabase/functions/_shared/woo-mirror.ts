/**
 * Shared helper: mirror a WooCommerce order payload into the internal
 * `orders` table. Used by both `woocommerce-webhook` (real-time) and
 * `woocommerce-orders-backfill` (cron / manual).
 */

// Map WooCommerce status -> internal orders.status enum value
export function mapWooStatusToInternal(wooStatus: string): string {
  switch (wooStatus) {
    case "processing": return "payment_received";
    case "shipped": return "in_transit";
    case "completed":
    case "delivered": return "delivery_done";
    case "cancelled": return "cancelled";
    case "refunded": return "cancelled";
    case "on-hold": return "po_received";
    case "pending": return "po_received";
    default: return "po_received";
  }
}

/**
 * Pull tracking number + URL out of a Woo order payload. Looks at the
 * common locations used by Advanced Shipment Tracking, YITH, WC Shipment
 * Tracking, and the generic meta_data array.
 */
// deno-lint-ignore no-explicit-any
export function extractTrackingFromWoo(payload: any): {
  number: string | null;
  url: string | null;
  provider: string | null;
  date_shipped: string | null;
  /**
   * True when the WC Shipment Tracking / AST meta key is present in the
   * payload (regardless of whether it contains items). Lets callers tell
   * "tracking was explicitly cleared in Woo" apart from "payload had no
   * tracking info at all", so they can decide whether to null fields out.
   */
  cleared: boolean;
} {
  let number: string | null = null;
  let url: string | null = null;
  let provider: string | null = null;
  let date_shipped: string | null = null;
  let trackingMetaSeen = false;

  // ---- AST (Advanced Shipment Tracking for WooCommerce) ---------------------
  // Newer AST versions expose tracking as a top-level REST field on the order:
  //   payload.wc_shipment_tracking_items: [...]
  //   payload.shipment_tracking:          [...]            (alt name)
  //   payload.ast_tracking_items / payload.tracking_items   (alt names)
  // Each item looks like:
  //   { tracking_number, tracking_provider, formatted_tracking_provider,
  //     tracking_link, custom_tracking_link, date_shipped, ast_tracking_link, ... }
  // deno-lint-ignore no-explicit-any
  const topLevelArrays: any[] = [
    payload?.wc_shipment_tracking_items,
    payload?.shipment_tracking_items,
    payload?.shipment_tracking,
    payload?.ast_tracking_items,
    payload?.tracking_items,
  ].filter(Array.isArray);
  if (topLevelArrays.length > 0) {
    trackingMetaSeen = true;
    const first = topLevelArrays[0][0];
    if (first && typeof first === "object") {
      number = number || first.tracking_number || null;
      url = url ||
        first.ast_tracking_link || first.tracking_link || first.tracking_url ||
        first.custom_tracking_link || null;
      provider = provider ||
        first.formatted_tracking_provider || first.tracking_provider ||
        first.custom_tracking_provider || null;
      if (!date_shipped && first.date_shipped) {
        const ds = first.date_shipped;
        if (typeof ds === "number" || /^\d+$/.test(String(ds))) {
          date_shipped = new Date(Number(ds) * 1000).toISOString().slice(0, 10);
        } else {
          date_shipped = String(ds).slice(0, 10);
        }
      }
    }
  }

  const meta = Array.isArray(payload?.meta_data) ? payload.meta_data : [];
  for (const m of meta) {
    const k = String(m?.key || "").toLowerCase();
    const v = m?.value;
    // WC Shipment Tracking + AST store items under one of these keys.
    if (
      k === "_wc_shipment_tracking_items" ||
      k === "_ast_shipment_tracking_items" ||
      k === "_shipment_tracking_items"
    ) {
      trackingMetaSeen = true;
      if (!Array.isArray(v) || !v[0]) continue;
      const first = v[0];
      number = number || first.tracking_number || null;
      url = url ||
        first.ast_tracking_link || first.tracking_link || first.tracking_url ||
        first.custom_tracking_link || null;
      provider = provider || first.formatted_tracking_provider || first.tracking_provider ||
        first.custom_tracking_provider || null;
      if (!date_shipped && first.date_shipped) {
        // date_shipped is often a unix timestamp (seconds) from the plugin
        const ds = first.date_shipped;
        if (typeof ds === "number" || /^\d+$/.test(String(ds))) {
          const secs = Number(ds);
          date_shipped = new Date(secs * 1000).toISOString().slice(0, 10);
        } else {
          date_shipped = String(ds).slice(0, 10);
        }
      }
      continue;
    }
    if (!v) continue;
    if (!number && /tracking[_-]?(number|no|id)$/.test(k)) number = String(v);
    if (!url && /tracking[_-]?(url|link)$/.test(k)) url = String(v);
    if (!provider && /(tracking[_-]?(provider|carrier|courier))/.test(k)) provider = String(v);
  }
  if (!number && payload?.tracking_number) number = String(payload.tracking_number);
  if (!url && payload?.tracking_url) url = String(payload.tracking_url);
  const cleared = trackingMetaSeen && !number;
  return { number, url, provider, date_shipped, cleared };
}

// Only orders dated this day or later may land in the internal `orders` table.
// HARD FLOOR: never backfill or mirror website orders dated before 2026-04-27.
export const WINDOW_START_ISO = "2026-04-27";

// System "website" sales user (admin) — required by NOT NULL FK columns.
const SYSTEM_USER_ID = "a8050cc3-7d17-44ac-a083-d8023d505331";
const SYSTEM_USER_NAME = "Website (Auto)";

// Send a Slack notification to the #sales-order-confirmations channel when a new
// website order lands. Failures are swallowed — Slack must never block
// order ingestion.
async function notifySlackWebsiteOrder(orderRow: Record<string, unknown>, orderId: string) {
  try {
    const botToken = Deno.env.get("SLACK_BOT_TOKEN");
    if (!botToken) {
      console.warn("[woo-mirror] SLACK_BOT_TOKEN not set, skipping Slack notify");
      return;
    }
    const channel = "sales-order-confirmations";
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
    .select("id, status, source, sales_attribution_locked, manual_overrides, procurement_edited")
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

  // Mirror website orders into the internal `orders` table for any status
  // that the UI treats as a paid/working order (processing, on-hold,
  // shipped, completed, delivered). "pending" (= Woo "Pending Payment")
  // is intentionally EXCLUDED: most of those abandon checkout and get
  // auto-cancelled, so they pollute Tally / Orders. When payment lands,
  // Woo flips the status to "processing" and the webhook fires again,
  // which is when we create the internal row.
  // Other statuses (failed, cancelled, refunded, …) are still routed to
  // Sales > Leads > Xboom Website only.
  const MIRROR_STATUSES = new Set(["processing", "on-hold", "shipped", "completed", "delivered"]);
  if (!existing && (!MIRROR_STATUSES.has(wooStatus) || !inWindow)) {
    await supabase.from("woo_sync_logs").insert({
      woo_order_id: orderId, event_type: eventType, direction: "in",
      status: "skipped", woo_status: wooStatus,
      error_message: !inWindow
        ? `Order date ${orderDateRaw} before window ${WINDOW_START_ISO}`
        : `Status '${wooStatus}' not mirrorable and no existing internal order`,
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
  const trackingCleared = !wooTracking.number && (
    wooTracking.cleared ||
    (Array.isArray(payload?.meta_data) &&
      (eventType === "order.updated" || eventType === "webhook_in" || eventType === "backfill"))
  );

  // When Woo moves an order BACK to a pre-shipped status (pending,
  // on-hold, processing), the seller is signalling that fulfilment was
  // undone. Force-clear tracking + actual_delivery on the internal row
  // even if the Woo payload still carries stale tracking meta from the
  // shipment-tracking plugin.
  const PRE_SHIPPED = new Set(["pending", "on-hold", "processing"]);
  const forceClearShipping = PRE_SHIPPED.has(wooStatus);

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

  // ---- Transition-only stamps ---------------------------------------------
  // Repeat webhooks for the SAME cancelled/refunded/delivered status must not
  // re-stamp timestamp fields; doing so re-fires the orders_woo_reverse_sync
  // trigger which PUTs back to Woo and causes Woo to re-fire order.updated,
  // creating an infinite webhook loop (see the 143256/143468 flood).
  const existingStatus = existing?.status ?? null;
  if (wooStatus === "cancelled" && existingStatus !== "cancelled") {
    orderRow.cancelled_at = new Date().toISOString();
    orderRow.cancellation_reason = "Cancelled on WooCommerce";
    orderRow.order_outcome = "OL";
    orderRow.lost_reason = "Customer cancelled on website";
  }
  if (wooStatus === "refunded" && existingStatus !== "cancelled") {
    // refunded internally maps to `cancelled`; only stamp on first transition
    orderRow.refund_status = "refunded";
    orderRow.refund_requested_at = new Date().toISOString();
    orderRow.refund_reason = "Refunded on WooCommerce";
  }
  if (
    (wooStatus === "delivered" || wooStatus === "completed") &&
    existingStatus !== "delivery_done"
  ) {
    orderRow.actual_delivery = new Date().toISOString().slice(0, 10);
    orderRow.order_outcome = "OW";
  }
  // If tracking was explicitly removed in Woo, clear actual_delivery too —
  // the user is signalling that this order is no longer delivered.
  if (trackingCleared) {
    orderRow.actual_delivery = null;
  }
  // Status reverted to pre-shipped: wipe shipping completion fields.
  if (forceClearShipping) {
    orderRow.tracking_number = null;
    orderRow.tracking_url = null;
    orderRow.courier_name = null;
    orderRow.actual_delivery = null;
  }

  let internalId: string | null = existing?.id ?? null;
  if (existing) {
    // Always reflect the latest tracking from Woo. The Advanced Shipment
    // Tracking plugin owns this data — internal edits should not stick.
    if (wooTracking.number && !forceClearShipping) {
      orderRow.tracking_number = wooTracking.number;
      if (wooTracking.url) orderRow.tracking_url = wooTracking.url;
      if (wooTracking.provider) orderRow.courier_name = wooTracking.provider;
    } else if (trackingCleared) {
      // Tracking removed in Woo — mirror the clear into internal orders.
      orderRow.tracking_number = null;
      orderRow.tracking_url = null;
      orderRow.courier_name = null;
    }
    // If a manager/admin has attributed this order to a real rep, the Woo
    // mirror must NOT overwrite that credit on re-syncs/webhooks.
    if ((existing as { sales_attribution_locked?: boolean }).sales_attribution_locked) {
      delete orderRow.sales_person_id;
      delete orderRow.sales_person_name;
    }
    // Respect manual edits made in the internal ERP. Any field listed in
    // `manual_overrides` is preserved exactly as the operator set it, so
    // the next Woo webhook / backfill does not silently revert it.
    const overrides = (existing as { manual_overrides?: string[] | null }).manual_overrides;
    if (Array.isArray(overrides) && overrides.length > 0) {
      for (const field of overrides) {
        if (typeof field === "string" && field in orderRow) {
          delete orderRow[field];
        }
      }
    }
    // Procurement guard: if the operator has manually set the order status
    // or supplier from the Procurement dialog, do NOT let Woo overwrite them.
    if ((existing as { procurement_edited?: boolean }).procurement_edited) {
      delete orderRow.status;
      delete orderRow.supplier_id;
      delete orderRow.supplier_name;
      delete orderRow.procurement_rate;
      delete orderRow.procurement_currency;
      delete orderRow.procurement_date;
      delete orderRow.internal_notes;
      delete orderRow.po_number;
      delete orderRow.po_url;
    }
    // Provenance guard: once an order exists internally, ingest must NEVER
    // rewrite `source` or `lead_source`. Attribution flips source to 'manual'
    // and the next webhook must not revert it. `external_id` is the durable
    // Woo-link marker; it's already set on the existing row.
    delete orderRow.source;
    delete orderRow.lead_source;
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
    if (wooTracking.provider) orderRow.courier_name = wooTracking.provider;
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
    // New website order created — notify Slack channel #sales-order-confirmations.
    // Skip pending-payment orders: most get cancelled, so the noise isn't useful.
    if (wooStatus !== "pending") {
      await notifySlackWebsiteOrder(orderRow, orderId);
    }
    // Fire-and-forget: auto-invite for drone orders coming in from the website.
    // This mirrors the manual create path in useOrders.ts and delegates every
    // gate (feature flag, drone-only via order_has_drone, cancelled-order skip,
    // send-once idempotency in kyc_email_log) to kyc-handler itself. We DO NOT
    // await the response — the Woo webhook must ack fast, and kyc-handler
    // logs its own outcome.
    if (wooStatus !== "cancelled" && orderRow.customer_email) {
      try {
        // deno-lint-ignore no-explicit-any
        (supabase as any).functions
          .invoke("kyc-handler", {
            body: { action: "onboard_order", order_id: internalId },
          })
          .catch((e: unknown) => {
            console.error("[woo-mirror] kyc onboard invoke failed:", e);
          });
      } catch (e) {
        console.error("[woo-mirror] kyc onboard invoke threw:", e);
      }
    }
  }

  if (internalId) {
    await supabase.from("order_items").delete().eq("order_id", internalId);
    const shippingLines = Array.isArray(payload?.shipping_lines) ? payload.shipping_lines : [];
    if (lineItems.length > 0 || shippingLines.length > 0) {
      // Look up pricelist weights for the SKUs in this order so we can
      // snapshot weight_grams onto order_items.
      // deno-lint-ignore no-explicit-any
      const skus = Array.from(new Set(
        lineItems.map((li: any) => (li?.sku || "").toString().trim()).filter(Boolean)
      ));
      // deno-lint-ignore no-explicit-any
      const names = Array.from(new Set(
        lineItems.map((li: any) => (li?.name || "").toString().trim()).filter(Boolean)
      ));
      const weightByCode = new Map<string, number>();
      const weightByName = new Map<string, number>();
      const categoryByCode = new Map<string, string>();
      const categoryByName = new Map<string, string>();
      if (skus.length > 0) {
        const { data: pw } = await supabase
          .from("pricelist").select("woo_sku, weight_grams, product_category").in("woo_sku", skus);
        for (const row of pw || []) {
          if (row?.woo_sku && row?.weight_grams != null) {
            weightByCode.set(String(row.woo_sku), Number(row.weight_grams));
          }
          if (row?.woo_sku && row?.product_category) {
            categoryByCode.set(String(row.woo_sku), String(row.product_category));
          }
        }
      }
      if (names.length > 0) {
        const { data: pn } = await supabase
          .from("pricelist").select("product_name, weight_grams, product_category").in("product_name", names);
        for (const row of pn || []) {
          const key = row?.product_name ? String(row.product_name).toLowerCase() : null;
          if (key && row?.weight_grams != null) {
            weightByName.set(key, Number(row.weight_grams));
          }
          if (key && row?.product_category) {
            categoryByName.set(key, String(row.product_category));
          }
        }
      }
      // deno-lint-ignore no-explicit-any
      const productItems = lineItems.map((li: any) => {
        const sku = (li?.sku || "").toString().trim();
        const nameKey = (li?.name || "").toString().trim().toLowerCase();
        // Pricelist rows already normalize weight to grams (via woo-product-map),
        // so match by SKU first and product_name as fallback. We intentionally
        // do NOT trust the raw Woo line-item `weight` value here because the
        // store unit (kg/g/lb/oz) isn't included on line items.
        let grams: number | null = null;
        if (sku && weightByCode.has(sku)) grams = weightByCode.get(sku)!;
        else if (weightByName.has(nameKey)) grams = weightByName.get(nameKey)!;
        // Resolve real product_category from pricelist. Fall back to
        // 'Uncategorized' so unmatched accessories/shipping don't false-
        // trigger the drone-based customer-confirmation flow.
        let category = "Uncategorized";
        if (sku && categoryByCode.has(sku)) category = categoryByCode.get(sku)!;
        else if (categoryByName.has(nameKey)) category = categoryByName.get(nameKey)!;
        return {
          order_id: internalId,
          product_name: li.name || "Item",
          product_code: li.sku || null,
          product_category: category,
          quantity: li.quantity || 1,
          unit_price: parseFloat(li.price || li.subtotal || "0") || 0,
          sales_price_includes_gst: false,
          weight_grams: grams,
        };
      });
      // Woo shipping_lines totals are also GST-EXCLUSIVE and are part of the
      // customer-paid order total. Mirror them as order_items so proformas
      // reconcile with paid website orders (e.g. Express Mode charges).
      // deno-lint-ignore no-explicit-any
      const shippingItems = shippingLines.map((sl: any) => ({
        order_id: internalId,
        product_name: sl.method_title || sl.method_id || "Shipping charges",
        product_code: sl.method_id || "WOO-SHIPPING",
        product_category: "Shipping",
        quantity: 1,
        unit_price: parseFloat(sl.total || "0") || 0,
        sales_price_includes_gst: false,
      })).filter((it: any) => it.unit_price > 0);
      const items = [...productItems, ...shippingItems];
      const { error: itErr } = await supabase.from("order_items").insert(items);
      if (itErr) console.error("[woo-mirror] order_items insert err", itErr.message);
    }

    // Weight-gated customer confirmation: the trigger has already flipped
    // confirmation_status to 'pending' on the orders row if any line item
    // was > 249 g. Kick off email + SMS to the customer.
    try {
      const { data: freshOrder } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, customer_email, customer_phone, confirmation_status")
        .eq("id", internalId)
        .maybeSingle();
      if (freshOrder && freshOrder.confirmation_status === "pending") {
        await invokeCustomerConfirmationFn(freshOrder.id);
      }
    } catch (e) {
      console.error("[woo-mirror] confirmation dispatch failed", e);
    }
  }

  await supabase.from("woo_sync_logs").insert({
    woo_order_id: orderId, internal_order_id: internalId,
    event_type: eventType, direction: "in", status: "success",
    woo_status: wooStatus,
  });
}

/**
 * Fire-and-forget invocation of the dedicated confirmation-request edge
 * function. Always resolves; errors are only logged so order mirroring
 * never fails on notification issues.
 */
async function invokeCustomerConfirmationFn(orderId: string): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    await fetch(`${url}/functions/v1/send-customer-confirmation-request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
      body: JSON.stringify({ order_id: orderId }),
    });
  } catch (e) {
    console.error("[woo-mirror] invokeCustomerConfirmationFn failed", e);
  }
}

/**
 * Upsert a WooCommerce REST/webhook payload into the `woocommerce_orders`
 * mirror table (the "Website Orders" UI). Owns the Woo→internal field
 * mapping for status / fulfillment / payment / tracking so that webhook
 * and reconcile paths stay in lock-step.
 */
// deno-lint-ignore no-explicit-any
export async function upsertWoocommerceOrder(supabase: any, payload: any, orderId: string, source: "webhook" | "reconcile" | "backfill") {
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

  const wooStatus: string = String(payload?.status || "pending").toLowerCase();

  const paymentStatusMap: Record<string, string> = {
    completed: "paid",
    processing: "paid",
    delivered: "paid",
    shipped: "paid",
    "on-hold": "pending",
    pending: "pending",
    failed: "failed",
    cancelled: "cancelled",
    refunded: "refunded",
  };

  const isPaid = wooStatus === "completed" || wooStatus === "processing" ||
    wooStatus === "delivered" || wooStatus === "shipped";
  const orderTotal = parseFloat(payload?.total || "0");

  const rawPhone = (payload?.billing?.phone ?? payload?.shipping?.phone ?? "").toString().trim();
  const phone: string | null = rawPhone.length > 0 ? rawPhone : null;

  const fulfillmentStatus = (wooStatus === "completed" || wooStatus === "delivered" || wooStatus === "shipped")
    ? "fulfilled"
    : "unfulfilled";

  const orderData: Record<string, unknown> = {
    woo_order_id: orderId,
    order_number: payload?.number ? String(payload.number) : orderId,
    source: "xboom_website",
    order_status: wooStatus,
    financial_status: wooStatus,
    fulfillment_status: fulfillmentStatus,
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
  if (phone !== null) orderData.customer_phone = phone;

  // ---- Tracking: always reflect latest from Woo (AST is source of truth) ----
  const trk = extractTrackingFromWoo(payload);
  if (trk.number) {
    orderData.tracking_number = trk.number;
    orderData.courier = trk.provider ?? null;
    orderData.expected_delivery = trk.date_shipped ?? null;
    orderData.tracking_status =
      (wooStatus === "delivered") ? "delivered" :
      (wooStatus === "completed" || wooStatus === "shipped") ? "in_transit" :
      "in_transit";
  } else if (trk.cleared || (source !== "webhook" /* reconcile/backfill always carry full payload */) || Array.isArray(payload?.meta_data)) {
    orderData.tracking_number = null;
    orderData.courier = null;
    orderData.expected_delivery = null;
    orderData.tracking_status = null;
  }

  const { error } = await supabase
    .from("woocommerce_orders")
    .upsert(orderData, { onConflict: "woo_order_id" });

  if (error) {
    console.error(`[woo-mirror] upsertWoocommerceOrder #${orderId}: ${error.message}`);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}