import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const WC_SITE_URL = (Deno.env.get("WC_SITE_URL") || "https://xboom.in").replace(/\/$/, "");
const WC_KEY = Deno.env.get("WC_CONSUMER_KEY") || "";
const WC_SECRET = Deno.env.get("WC_CONSUMER_SECRET") || "";
const WC_AUTH = "Basic " + btoa(`${WC_KEY}:${WC_SECRET}`);

// Whitelist of statuses we allow agents to push to WooCommerce.
// Custom statuses (delivered, return-*) need to exist in the WC site.
const ALLOWED_STATUSES = new Set([
  "pending",
  "processing",
  "on-hold",
  "completed",
  "cancelled",
  "refunded",
  "failed",
  "shipped",
  "delivered",
  "return-requested",
  "return-approved",
  "return-cancelled",
  "partially-paid",
]);

// Roles allowed to push status changes back to WooCommerce
const ALLOWED_ROLES = new Set(["admin", "supply_chain", "sales_manager", "finance"]);

// Terminal states cannot be left without an explicit reopen.
const TERMINAL_STATUSES = new Set(["cancelled", "failed", "refunded"]);

// Statuses considered "active" — an order returning to active life from a terminal
// state requires an explicit override flag.
const ACTIVE_STATUSES = new Set([
  "pending",
  "processing",
  "on-hold",
  "completed",
  "delivered",
  "partially-paid",
]);

/** Roles allowed to bypass terminal-state lock and force-reopen an order. */
const REOPEN_ROLES = new Set(["admin", "supply_chain", "sales_manager"]);

/** Statuses that should trigger a customer-facing WhatsApp notification.
 * Shipment events (shipped/out_for_delivery/delivered) are queued separately
 * by the woocommerce_orders.tracking_status DB trigger.
 */
const NOTIFIABLE_STATUSES = new Set([
  "processing",
  "shipped",
  "completed",
  "delivered",
  "cancelled",
]);

/** WhatsApp template name per status (provider-agnostic identifiers).
 * The actual template id used by the provider lives in notification_templates;
 * this is just a human-friendly fallback label for the queue row.
 */
const WHATSAPP_TEMPLATES: Record<string, string> = {
  processing: "order_processing_v1",
  shipped: "order_shipped_v1",
  completed: "order_completed_v1",
  delivered: "order_delivered_v1",
  cancelled: "order_cancelled_v1",
};

/**
 * Validate a transition. Returns null if allowed, or an error string if not.
 * The only allowed reopen path is `cancelled → processing` with allow_reopen=true.
 */
function validateTransition(
  from: string,
  to: string,
  allowReopen: boolean,
): string | null {
  if (from === to) return null;

  // Terminal → anything: locked unless explicit reopen
  if (TERMINAL_STATUSES.has(from)) {
    if (!allowReopen) {
      return `Order is in a final state (${from}) and cannot be changed without reopen.`;
    }
    // Only cancelled orders are reopenable, and only into processing.
    if (from !== "cancelled") {
      return `${from} orders cannot be reopened.`;
    }
    if (to !== "processing") {
      return `Reopen must move the order to 'processing' (got '${to}').`;
    }
    return null;
  }

  // Only `processing` is a mutable source state for UI-driven transitions.
  // Everything else (pending, on-hold, shipped, delivered, completed, …)
  // is read-only from the XBoom UI — changes must come from WooCommerce
  // itself or the dedicated tracking flow.
  if (from !== "processing") {
    return `Only orders in 'processing' can be updated (current: ${from}).`;
  }
  // From processing, allow movement only to a restricted set.
  const ALLOWED_FROM_PROCESSING = new Set([
    "shipped", "delivered", "completed", "on-hold", "cancelled",
  ]);
  if (!ALLOWED_FROM_PROCESSING.has(to)) {
    return `Cannot move 'processing' → '${to}'.`;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ------------ AUTH ------------
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claims.claims.sub as string;
  const userEmail = (claims.claims.email as string) || null;

  // ------------ AUTHORIZATION ------------
  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const userRoles = (roleRows || []).map((r: { role: string }) => r.role);
  const allowed = userRoles.some((r: string) => ALLOWED_ROLES.has(r));
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Forbidden — insufficient role" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ------------ INPUT ------------
  let body: {
    woo_order_id?: string;
    new_status?: string;
    note?: string;
    allow_reopen?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const wooOrderId = String(body.woo_order_id || "").trim();
  const newStatus = String(body.new_status || "").trim().toLowerCase();
  const allowReopen = body.allow_reopen === true;

  if (!wooOrderId || !/^\d+$/.test(wooOrderId)) {
    return new Response(JSON.stringify({ error: "Invalid woo_order_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!newStatus || !ALLOWED_STATUSES.has(newStatus)) {
    return new Response(
      JSON.stringify({ error: `Status not allowed: ${newStatus}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Look up current row
  const { data: existing } = await admin
    .from("woocommerce_orders")
    .select("woo_order_id, order_number, order_status, customer_name, customer_phone, customer_email, total_sales_amount, currency")
    .eq("woo_order_id", wooOrderId)
    .maybeSingle();

  if (!existing) {
    return new Response(JSON.stringify({ error: "Order not found in XBoom" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const previousStatus = (existing.order_status || "").toLowerCase();

  if (previousStatus === newStatus) {
    return new Response(
      JSON.stringify({ success: true, no_change: true, status: newStatus }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ------------ TRANSITION VALIDATION ------------
  // Only privileged roles can ever pass `allow_reopen`.
  const canReopen = userRoles.some((r: string) => REOPEN_ROLES.has(r));
  const effectiveAllowReopen = allowReopen && canReopen;

  const transitionErr = validateTransition(previousStatus, newStatus, effectiveAllowReopen);
  if (transitionErr) {
    // Audit the rejected attempt
    await admin.from("woocommerce_order_status_logs").insert({
      woo_order_id: wooOrderId,
      order_number: existing.order_number,
      previous_status: previousStatus,
      new_status: newStatus,
      changed_by: userId,
      changed_by_email: userEmail,
      source: "xboom_ui",
      woo_api_success: false,
      woo_api_response: null,
      error_message: `Blocked: ${transitionErr}`,
    });
    return new Response(
      JSON.stringify({ success: false, error: transitionErr, code: "INVALID_TRANSITION" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ------------ PUSH TO WOOCOMMERCE ------------
  if (!WC_KEY || !WC_SECRET) {
    return new Response(
      JSON.stringify({ error: "WooCommerce credentials not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const url = `${WC_SITE_URL}/wp-json/wc/v3/orders/${wooOrderId}`;
  let wooOk = false;
  let wooResponse: any = null;
  let errMsg: string | null = null;

  try {
    const resp = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: WC_AUTH,
      },
      body: JSON.stringify({ status: newStatus }),
    });
    const text = await resp.text();
    try { wooResponse = JSON.parse(text); } catch { wooResponse = { raw: text.slice(0, 500) }; }
    wooOk = resp.ok;
    if (!resp.ok) {
      errMsg = `WooCommerce API ${resp.status}: ${wooResponse?.message || text.slice(0, 200)}`;
    }
  } catch (e) {
    errMsg = e instanceof Error ? e.message : "WooCommerce request failed";
  }

  // ------------ UPDATE LOCAL DB (only if Woo accepted) ------------
  if (wooOk) {
    const isPaid = newStatus === "completed" || newStatus === "processing" || newStatus === "delivered";
    const paymentStatusMap: Record<string, string> = {
      completed: "paid", processing: "paid", delivered: "paid",
      "on-hold": "pending", pending: "pending",
      failed: "failed", cancelled: "cancelled", refunded: "refunded",
    };
    await admin
      .from("woocommerce_orders")
      .update({
        order_status: newStatus,
        financial_status: newStatus,
        fulfillment_status:
          (newStatus === "completed" || newStatus === "delivered") ? "fulfilled" : "unfulfilled",
        payment_status: paymentStatusMap[newStatus] || "pending",
        woo_updated_at: new Date().toISOString(),
      })
      .eq("woo_order_id", wooOrderId);
  }

  // ------------ AUDIT LOG ------------
  const { data: logRow } = await admin
    .from("woocommerce_order_status_logs")
    .insert({
      woo_order_id: wooOrderId,
      order_number: existing.order_number,
      previous_status: previousStatus,
      new_status: newStatus,
      changed_by: userId,
      changed_by_email: userEmail,
      source: "xboom_ui",
      woo_api_success: wooOk,
      woo_api_response: wooResponse,
      error_message: errMsg,
    })
    .select("id")
    .maybeSingle();

  // ------------ QUEUE WHATSAPP NOTIFICATION ------------
  // Only queue when WooCommerce accepted the change AND the new status is
  // customer-notifiable. Idempotency is enforced by the unique index on
  // (woo_order_id, status_trigger, channel) — duplicates are silently ignored.
  // This MUST NOT fail the request.
  if (wooOk && NOTIFIABLE_STATUSES.has(newStatus)) {
    try {
      const customerName =
        (existing as { customer_name?: string | null }).customer_name || null;
      const customerPhone =
        (existing as { customer_phone?: string | null }).customer_phone || null;
      const customerEmail =
        (existing as { customer_email?: string | null }).customer_email || null;
      const amount =
        Number((existing as { total_sales_amount?: number | null }).total_sales_amount) || 0;
      const currency =
        (existing as { currency?: string | null }).currency || "INR";

      const { error: notifErr } = await admin
        .from("order_notifications")
        .insert({
          woo_order_id: wooOrderId,
          order_number: existing.order_number,
          status_trigger: newStatus,
          channel: "whatsapp",
          phone: customerPhone,
          template_name: WHATSAPP_TEMPLATES[newStatus] || `order_${newStatus}`,
          payload: {
            customer_name: customerName,
            customer_email: customerEmail,
            order_id: wooOrderId,
            order_number: existing.order_number,
            amount,
            currency,
            status: newStatus,
          },
          status_log_id: logRow?.id ?? null,
          // status defaults to 'pending', next_attempt_at defaults to now()
        });
      if (notifErr && notifErr.code !== "23505") {
        // 23505 = unique_violation → idempotent skip; anything else is a real error to log.
        console.warn(
          `[update-woo-order-status] Failed to queue notification:`,
          notifErr,
        );
      }
    } catch (e) {
      console.warn(`[update-woo-order-status] Notification queue exception:`, e);
    }
  }

  if (!wooOk) {
    return new Response(
      JSON.stringify({ success: false, error: errMsg || "WooCommerce rejected the update" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      woo_order_id: wooOrderId,
      previous_status: previousStatus,
      new_status: newStatus,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});