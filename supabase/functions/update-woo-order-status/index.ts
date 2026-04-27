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
  "return-requested",
  "return-approved",
  "return-cancelled",
  "partially-paid",
]);

// Roles allowed to push status changes back to WooCommerce
const ALLOWED_ROLES = new Set(["admin", "supply_chain", "sales_manager", "finance"]);

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
  let body: { woo_order_id?: string; new_status?: string; note?: string };
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
    .select("woo_order_id, order_number, order_status")
    .eq("woo_order_id", wooOrderId)
    .maybeSingle();

  if (!existing) {
    return new Response(JSON.stringify({ error: "Order not found in XBoom" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const previousStatus = existing.order_status;

  if (previousStatus === newStatus) {
    return new Response(
      JSON.stringify({ success: true, no_change: true, status: newStatus }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
  await admin.from("woocommerce_order_status_logs").insert({
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
  });

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