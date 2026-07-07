// Internal order status updater. Protected by INTERNAL_ORDER_STATUS_SECRET.
// On status transitions to "Shipped" / "completed", triggers a WhatsApp notification.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Send a plain WhatsApp text message via Interakt. */
async function sendWhatsAppNotification(phone: string, message: string) {
  const apiKey = Deno.env.get("INTERAKT_API_KEY");
  if (!apiKey) {
    console.warn("[update-order-status] INTERAKT_API_KEY missing — skipping WhatsApp send.");
    return { sent: false, reason: "missing_api_key" };
  }
  if (!phone) return { sent: false, reason: "missing_phone" };

  const digits = phone.replace(/\D/g, "");
  const last10 = digits.slice(-10);
  const countryCode = digits.length > 10 ? digits.slice(0, digits.length - 10) : "91";

  try {
    const res = await fetch("https://api.interakt.ai/v1/public/message/", {
      method: "POST",
      headers: {
        Authorization: `Basic ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        countryCode: `+${countryCode}`,
        phoneNumber: last10,
        type: "Text",
        data: { message },
      }),
    });
    const text = await res.text();
    console.log("[update-order-status] WhatsApp send:", res.status, text.slice(0, 200));
    return { sent: res.ok, status: res.status, response: text };
  } catch (e) {
    console.error("[update-order-status] WhatsApp send error:", e);
    return { sent: false, reason: "request_failed" };
  }
}

function shippedTemplate(name: string, orderId: string, courier: string, tNum: string, eta: string) {
  const first = name?.split(" ")[0] || "there";
  return `Hi ${first}, your order ${orderId} has been shipped${courier ? ` via ${courier}` : ""}.${
    tNum ? ` Tracking ID: ${tNum}.` : ""
  }${eta ? ` Expected delivery: ${eta}.` : ""}`;
}

function deliveredTemplate(name: string, orderId: string) {
  const first = name?.split(" ")[0] || "there";
  return `Hi ${first}, your order ${orderId} has been successfully delivered. Thank you for shopping with XBoom!`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // Auth: shared secret header
  const expected = Deno.env.get("INTERNAL_ORDER_STATUS_SECRET");
  const provided = req.headers.get("x-internal-secret");
  if (!expected || provided !== expected) {
    console.warn("[update-order-status] unauthorized request");
    return json(401, { error: "Unauthorized" });
  }

  let body: {
    order_id?: string;
    status?: string;
    tracking_status?: string;
    tracking_number?: string;
    courier?: string;
    expected_delivery?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const { order_id, status, tracking_status, tracking_number, courier, expected_delivery } = body;
  console.log("[update-order-status] request:", body);

  if (!order_id) return json(400, { error: "order_id is required" });

  // Reject order IDs containing PostgREST filter separators — the value is
  // interpolated into an `.or()` filter below on a service-role client.
  if (typeof order_id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(order_id)) {
    return json(400, { error: "Invalid order_id" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Fetch existing row to detect transitions
  const { data: existing, error: fetchErr } = await supabase
    .from("woocommerce_orders")
    .select(
      "woo_order_id, order_number, order_status, tracking_status, tracking_number, courier, expected_delivery, customer_name, customer_phone",
    )
    .or(`woo_order_id.eq.${order_id},order_number.eq.${order_id}`)
    .order("woo_created_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (fetchErr) {
    console.error("[update-order-status] fetch error:", fetchErr);
    return json(500, { error: "Database error" });
  }
  if (!existing) {
    console.log("[update-order-status] order not found:", order_id);
    return json(404, { error: "Order not found" });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status !== undefined) updates.order_status = status;
  if (tracking_status !== undefined) updates.tracking_status = tracking_status;
  if (tracking_number !== undefined) updates.tracking_number = tracking_number;
  if (courier !== undefined) updates.courier = courier;
  if (expected_delivery !== undefined) updates.expected_delivery = expected_delivery;

  const { error: updErr } = await supabase
    .from("woocommerce_orders")
    .update(updates)
    .eq("woo_order_id", existing.woo_order_id);

  if (updErr) {
    console.error("[update-order-status] update error:", updErr);
    return json(500, { error: "Update failed" });
  }

  console.log("[update-order-status] updated:", existing.woo_order_id);

  // Detect transitions and trigger WhatsApp
  const newTracking = (tracking_status ?? existing.tracking_status ?? "").toString();
  const oldTracking = (existing.tracking_status ?? "").toString();
  const newStatus = (status ?? existing.order_status ?? "").toString();
  const oldStatus = (existing.order_status ?? "").toString();

  const orderIdDisplay = (existing.order_number || existing.woo_order_id) as string;
  const phone = (existing.customer_phone || "") as string;
  const name = (existing.customer_name || "") as string;

  const finalCourier = (courier ?? existing.courier ?? "") as string;
  const finalTNum = (tracking_number ?? existing.tracking_number ?? "") as string;
  const finalEta = (expected_delivery ?? existing.expected_delivery ?? "") as string;

  const events: { type: string; result: unknown }[] = [];

  if (
    newTracking.toLowerCase() === "shipped" &&
    oldTracking.toLowerCase() !== "shipped"
  ) {
    console.log("[update-order-status] event: shipped");
    const msg = shippedTemplate(name, orderIdDisplay, finalCourier, finalTNum, finalEta);
    const result = await sendWhatsAppNotification(phone, msg);
    events.push({ type: "shipped", result });
  }

  if (newStatus === "completed" && oldStatus !== "completed") {
    console.log("[update-order-status] event: delivered");
    const msg = deliveredTemplate(name, orderIdDisplay);
    const result = await sendWhatsAppNotification(phone, msg);
    events.push({ type: "delivered", result });
  }

  return json(200, {
    success: true,
    order_id: orderIdDisplay,
    updated: Object.keys(updates),
    events,
  });
});