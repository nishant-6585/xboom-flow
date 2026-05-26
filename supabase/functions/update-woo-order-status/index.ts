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
  "delivered",
  "shipped",
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
  "shipped",
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

  // From an active state, terminal exits and other active transitions are fine.
  if (ACTIVE_STATUSES.has(from) || from === "" || from === "any") {
    return null;
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
    tracking_carrier?: string;
    tracking_number?: string;
    tracking_url?: string;
    expected_delivery?: string;
    customer_note?: string;
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
  const trackingCarrier = (body.tracking_carrier || "").toString().trim().slice(0, 100);
  const trackingNumber = (body.tracking_number || "").toString().trim().slice(0, 200);
  const trackingUrl = (body.tracking_url || "").toString().trim().slice(0, 500);
  const expectedDelivery = (body.expected_delivery || "").toString().trim().slice(0, 32);
  const customerNote = (body.customer_note || "").toString().trim().slice(0, 2000);
  const hasStatusChange = !!newStatus;
  const hasTracking = !!(trackingCarrier || trackingNumber || trackingUrl || expectedDelivery);
  const hasNote = !!customerNote;
  const allowReopen = body.allow_reopen === true;

  if (!wooOrderId || !/^\d+$/.test(wooOrderId)) {
    return new Response(JSON.stringify({ error: "Invalid woo_order_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!hasStatusChange && !hasTracking && !hasNote) {
    return new Response(
      JSON.stringify({ error: "Nothing to update — provide new_status, tracking_*, or customer_note" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  // Validate expected_delivery is ISO date (YYYY-MM-DD) if provided
  if (expectedDelivery && !/^\d{4}-\d{2}-\d{2}$/.test(expectedDelivery)) {
    return new Response(
      JSON.stringify({ error: "expected_delivery must be YYYY-MM-DD" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (hasStatusChange && !ALLOWED_STATUSES.has(newStatus)) {
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

  if (hasStatusChange && previousStatus === newStatus && !hasTracking && !hasNote) {
    return new Response(
      JSON.stringify({ success: true, no_change: true, status: newStatus }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ------------ TRANSITION VALIDATION ------------
  // Only privileged roles can ever pass `allow_reopen`.
  const canReopen = userRoles.some((r: string) => REOPEN_ROLES.has(r));
  const effectiveAllowReopen = allowReopen && canReopen;

  const transitionErr = hasStatusChange && previousStatus !== newStatus
    ? validateTransition(previousStatus, newStatus, effectiveAllowReopen)
    : null;
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

  const wooBody: Record<string, unknown> = {};
  if (hasStatusChange && previousStatus !== newStatus) wooBody.status = newStatus;
  if (hasNote) wooBody.customer_note = customerNote;
  if (hasTracking) {
    const meta: { key: string; value: string }[] = [];
    if (trackingCarrier) meta.push({ key: "_xboom_tracking_carrier", value: trackingCarrier });
    if (trackingNumber) meta.push({ key: "_xboom_tracking_number", value: trackingNumber });
    if (trackingUrl) meta.push({ key: "_xboom_tracking_url", value: trackingUrl });
    if (expectedDelivery) meta.push({ key: "_xboom_expected_delivery", value: expectedDelivery });
    wooBody.meta_data = meta;
  }

  try {
    const resp = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: WC_AUTH,
      },
      body: JSON.stringify(wooBody),
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

  // ------------ PUSH SHIPMENT TRACKING (official WC Shipment Tracking plugin) ------------
  // The plugin exposes /wp-json/wc/v3/orders/<id>/shipment-trackings/. Posting
  // here makes the tracking appear in the WooCommerce admin "Shipment Tracking"
  // panel and on the customer's order page — exactly the same as if a staff
  // member typed it manually in WordPress.
  if (wooOk && hasTracking && trackingNumber) {
    try {
      const stUrl = `${WC_SITE_URL}/wp-json/wc/v3/orders/${wooOrderId}/shipment-trackings/`;
      const stBody: Record<string, unknown> = {
        tracking_number: trackingNumber,
        date_shipped: expectedDelivery || new Date().toISOString().slice(0, 10),
      };
      if (trackingCarrier) {
        // Always use custom-provider mode so any free-text carrier the agent
        // typed works. Provider slug matching against the plugin's built-in
        // list would require an extra round-trip to /shipment-trackings/providers.
        stBody.custom_tracking_provider = trackingCarrier;
        if (trackingUrl) stBody.custom_tracking_link = trackingUrl;
      } else if (trackingUrl) {
        stBody.custom_tracking_provider = "Tracking";
        stBody.custom_tracking_link = trackingUrl;
      }
      const stResp = await fetch(stUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: WC_AUTH,
        },
        body: JSON.stringify(stBody),
      });
      if (!stResp.ok) {
        const stText = await stResp.text();
        console.warn(`[update-woo-order-status] Shipment-tracking POST failed ${stResp.status}: ${stText.slice(0, 200)}`);
        // Don't fail the whole request — meta_data fallback above already saved it.
      }
    } catch (e) {
      console.warn(`[update-woo-order-status] Shipment-tracking exception:`, e);
    }
  }

  // ------------ UPDATE LOCAL DB (only if Woo accepted) ------------
  if (wooOk) {
    const updates: Record<string, unknown> = {
      woo_updated_at: new Date().toISOString(),
    };
    if (hasStatusChange && previousStatus !== newStatus) {
      const paymentStatusMap: Record<string, string> = {
        completed: "paid", processing: "paid", delivered: "paid",
        "on-hold": "pending", pending: "pending",
        failed: "failed", cancelled: "cancelled", refunded: "refunded",
      };
      updates.order_status = newStatus;
      updates.financial_status = newStatus;
      updates.fulfillment_status =
        (newStatus === "completed" || newStatus === "delivered") ? "fulfilled" : "unfulfilled";
      updates.payment_status = paymentStatusMap[newStatus] || "pending";
    }
    if (trackingCarrier) updates.tracking_status = trackingCarrier;
    if (trackingNumber) updates.tracking_number = trackingNumber;
    if (trackingCarrier) updates.courier = trackingCarrier;
    if (expectedDelivery) updates.expected_delivery = expectedDelivery;
    await admin
      .from("woocommerce_orders")
      .update(updates)
      .eq("woo_order_id", wooOrderId);
  }

  // ------------ AUDIT LOG ------------
  // Only log a row when the status actually changed; tracking/note-only edits
  // are recorded implicitly by woo_updated_at.
  let logRow: { id: string } | null = null;
  if (hasStatusChange && previousStatus !== newStatus) {
    const { data: inserted } = await admin
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
    logRow = (inserted as { id: string } | null) ?? null;
  }

  // ------------ QUEUE WHATSAPP NOTIFICATION ------------
  // Only queue when WooCommerce accepted the change AND the new status is
  // customer-notifiable. Idempotency is enforced by the unique index on
  // (woo_order_id, status_trigger, channel) — duplicates are silently ignored.
  // This MUST NOT fail the request.
  if (wooOk && hasStatusChange && previousStatus !== newStatus && NOTIFIABLE_STATUSES.has(newStatus)) {
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