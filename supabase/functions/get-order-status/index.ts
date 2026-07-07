// Public order tracking API
// POST { phone?: string, order_id?: string } -> order status + AI-friendly message
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizePhone(p: string): string[] {
  const digits = p.replace(/\D/g, "");
  const variants = new Set<string>([p, digits]);
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    variants.add(last10);
    variants.add("+91" + last10);
    variants.add("91" + last10);
    variants.add("0" + last10);
  }
  return Array.from(variants).filter(Boolean);
}

function buildMessage(order: Record<string, unknown>): string {
  const id = order.order_number || order.woo_order_id;
  const name = (order.customer_name as string)?.split(" ")[0] || "there";
  const status = (order.order_status as string) || "pending";
  const tStatus = (order.tracking_status as string) || "";
  const courier = (order.courier as string) || "";
  const tNum = (order.tracking_number as string) || "";
  const eta = order.expected_delivery as string | null;

  if (status === "completed") {
    return `Hi ${name}, your order ${id} has been delivered. Thank you for shopping with XBoom!`;
  }
  if (tStatus.toLowerCase() === "shipped" || tStatus.toLowerCase() === "in_transit") {
    const courierTxt = courier ? ` via ${courier}` : "";
    const tNumTxt = tNum ? `. Tracking ID: ${tNum}` : "";
    const etaTxt = eta ? `. Expected delivery: ${eta}` : "";
    return `Hi ${name}, your order ${id} has been shipped${courierTxt}${tNumTxt}${etaTxt}.`;
  }
  if (status === "processing") {
    return `Hi ${name}, your order ${id} is being processed and will be shipped soon.`;
  }
  if (status === "cancelled") {
    return `Hi ${name}, your order ${id} has been cancelled. Please contact support if this is unexpected.`;
  }
  if (status === "failed") {
    return `Hi ${name}, your order ${id} payment failed. Please retry or contact support.`;
  }
  return `Hi ${name}, your order ${id} is currently ${status}.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // Shared-secret authentication — only authorised callers (e.g. WhatsApp bot)
  // can hit this endpoint. Prevents anonymous enumeration of customer orders.
  const expectedSecret = Deno.env.get("ORDER_STATUS_API_SECRET");
  if (expectedSecret) {
    const provided =
      req.headers.get("x-api-secret") ||
      req.headers.get("x-shared-secret") ||
      "";
    if (provided !== expectedSecret) {
      return json(401, { error: "Unauthorized", message: "Invalid or missing API secret." });
    }
  } else {
    console.warn("[get-order-status] ORDER_STATUS_API_SECRET not configured — rejecting all requests");
    return json(503, { error: "Not configured", message: "Service unavailable." });
  }

  let body: { phone?: string; order_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Missing input", message: "Invalid JSON body" });
  }

  const phone = body.phone?.toString().trim();
  const orderId = body.order_id?.toString().trim();

  console.log("[get-order-status] request:", { phone: phone ? "***" : null, orderId });

  if (!phone && !orderId) {
    return json(400, {
      error: "Missing input",
      message: "Please provide either an order ID or phone number.",
    });
  }

  // Reject order IDs that contain PostgREST filter separators (`,`, `(`, `)`,
  // `.`, quotes) — the value is interpolated into an `.or()` filter string
  // below and a crafted value could otherwise inject extra clauses.
  if (orderId && !/^[A-Za-z0-9_-]{1,64}$/.test(orderId)) {
    return json(400, {
      error: "Invalid input",
      message: "Invalid order ID format.",
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cols =
    "woo_order_id, order_number, order_status, tracking_status, tracking_number, courier, expected_delivery, woo_created_at";

  let order: Record<string, unknown> | null = null;

  if (orderId) {
    const { data, error } = await supabase
      .from("woocommerce_orders")
      .select(cols)
      .or(`woo_order_id.eq.${orderId},order_number.eq.${orderId}`)
      .order("woo_created_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[get-order-status] db error (by id):", error);
      return json(500, { error: "Internal error", message: "Could not look up order." });
    }
    order = data as Record<string, unknown> | null;
  } else if (phone) {
    const variants = normalizePhone(phone);
    const { data, error } = await supabase
      .from("woocommerce_orders")
      .select(cols)
      .in("customer_phone", variants)
      .order("woo_created_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (error) {
      console.error("[get-order-status] db error (by phone):", error);
      return json(500, { error: "Internal error", message: "Could not look up order." });
    }
    order = (data && data[0]) as Record<string, unknown> | null;
  }

  if (!order) {
    console.log("[get-order-status] not found");
    return json(404, {
      error: "No order found",
      message:
        "We couldn't find an order matching those details. Please double-check the order ID or phone number.",
    });
  }

  const message = buildMessage(order);
  console.log("[get-order-status] found:", order.woo_order_id);

  return json(200, {
    order_id: order.order_number || order.woo_order_id,
    status: order.order_status || "",
    tracking_status: order.tracking_status || "",
    tracking_number: order.tracking_number || "",
    courier: order.courier || "",
    expected_delivery: order.expected_delivery || "",
    message,
  });
});