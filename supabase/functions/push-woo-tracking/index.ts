import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const WC_SITE_URL = (Deno.env.get("WC_SITE_URL") || "https://xboom.in").replace(/\/$/, "");
const WC_KEY = Deno.env.get("WC_CONSUMER_KEY") || "";
const WC_SECRET = Deno.env.get("WC_CONSUMER_SECRET") || "";
const WC_AUTH = "Basic " + btoa(`${WC_KEY}:${WC_SECRET}`);

const ALLOWED_ROLES = new Set(["admin", "supply_chain", "sales_manager", "finance"]);

/** Carriers natively recognised by Woo Shipment Tracking plugin.
 *  Anything else falls back to a custom provider entry. */
const WC_NATIVE_PROVIDERS: Record<string, string> = {
  "dhl": "DHL",
  "dhl express india": "DHL",
  "fedex": "FedEx",
  "fedex india": "FedEx",
  "ups": "UPS",
  "usps": "USPS",
  "royal mail": "Royal Mail",
  "dpd": "DPD",
  "tnt": "TNT Express",
  "tnt express": "TNT Express",
};

const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "");

function mapProvider(name: string): { native: string | null; label: string } {
  const key = norm(name);
  const native = WC_NATIVE_PROVIDERS[key] || null;
  return { native, label: name.trim() };
}

const BodySchema = z.object({
  woo_order_id: z.string().regex(/^\d+$/, "Invalid order id"),
  provider: z.string().min(1).max(120),
  tracking_number: z.string().min(1).max(120),
  tracking_url: z.string().url().max(500).optional().or(z.literal("")),
  date_shipped: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ------ AUTH ------
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claims.claims.sub as string;
  const userEmail = (claims.claims.email as string) || null;

  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const { data: roleRows } = await admin
    .from("user_roles").select("role").eq("user_id", userId);
  const userRoles = (roleRows || []).map((r: { role: string }) => r.role);
  if (!userRoles.some((r: string) => ALLOWED_ROLES.has(r))) {
    return new Response(JSON.stringify({ error: "Forbidden — insufficient role" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ------ INPUT ------
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { woo_order_id, provider, tracking_number, tracking_url, date_shipped } = parsed.data;
  const dateShipped = date_shipped || new Date().toISOString().slice(0, 10);

  // ------ ORDER LOOKUP ------
  const { data: existing } = await admin
    .from("woocommerce_orders")
    .select("woo_order_id, order_number, order_status")
    .eq("woo_order_id", woo_order_id)
    .maybeSingle();
  if (!existing) {
    return new Response(JSON.stringify({ error: "Order not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const currentStatus = (existing.order_status || "").toLowerCase();
  if (currentStatus !== "processing") {
    return new Response(JSON.stringify({
      error: `Tracking can only be added to processing orders (current: ${currentStatus}).`,
      code: "INVALID_STATE",
    }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (!WC_KEY || !WC_SECRET) {
    return new Response(JSON.stringify({ error: "WooCommerce credentials not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ------ PUSH TRACKING TO WOO ------
  const { native, label } = mapProvider(provider);
  const trackingBody = native
    ? {
        tracking_provider: native,
        tracking_number,
        date_shipped: dateShipped,
      }
    : {
        custom_tracking_provider: label || "Custom Provider",
        custom_tracking_link: tracking_url || "",
        tracking_number,
        date_shipped: dateShipped,
      };

  let trackingOk = false;
  let trackingErr: string | null = null;
  let trackingResp: unknown = null;

  try {
    const trackingUrlEndpoint =
      `${WC_SITE_URL}/wp-json/wc-shipment-tracking/v3/orders/${woo_order_id}/shipment-trackings`;
    const resp = await fetch(trackingUrlEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: WC_AUTH,
      },
      body: JSON.stringify(trackingBody),
    });
    const text = await resp.text();
    try { trackingResp = JSON.parse(text); } catch { trackingResp = { raw: text.slice(0, 500) }; }
    trackingOk = resp.ok;
    if (!resp.ok) {
      trackingErr = `Shipment-Tracking API ${resp.status}: ${(trackingResp as { message?: string })?.message || text.slice(0, 200)}`;
    }
  } catch (e) {
    trackingErr = e instanceof Error ? e.message : "Shipment-Tracking request failed";
  }

  // Fallback: if the plugin endpoint isn't available, add a plain order note
  // so the courier info still reaches the WC admin.
  if (!trackingOk) {
    try {
      const noteUrl = `${WC_SITE_URL}/wp-json/wc/v3/orders/${woo_order_id}/notes`;
      const noteBody = {
        note: `Tracking added by XBoom: ${label} #${tracking_number}` +
          (tracking_url ? ` — ${tracking_url}` : "") +
          ` (shipped ${dateShipped}).`,
        customer_note: false,
      };
      await fetch(noteUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: WC_AUTH,
        },
        body: JSON.stringify(noteBody),
      });
    } catch { /* best-effort */ }
  }

  // ------ FLIP STATUS → shipped ------
  const statusUrl = `${WC_SITE_URL}/wp-json/wc/v3/orders/${woo_order_id}`;
  let statusOk = false;
  let statusErr: string | null = null;
  try {
    const resp = await fetch(statusUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: WC_AUTH,
      },
      body: JSON.stringify({ status: "shipped" }),
    });
    statusOk = resp.ok;
    if (!resp.ok) {
      const text = await resp.text();
      statusErr = `Status PUT ${resp.status}: ${text.slice(0, 200)}`;
    }
  } catch (e) {
    statusErr = e instanceof Error ? e.message : "Status update failed";
  }

  // ------ UPDATE LOCAL DB ------
  // We update regardless of Woo result so the operator sees their input;
  // the audit log captures any Woo-side failures.
  await admin
    .from("woocommerce_orders")
    .update({
      courier: label,
      tracking_number,
      tracking_status: "shipped",
      order_status: statusOk ? "shipped" : currentStatus,
      fulfillment_status: statusOk ? "shipped" : "unfulfilled",
      woo_updated_at: new Date().toISOString(),
    })
    .eq("woo_order_id", woo_order_id);

  await admin.from("woocommerce_order_status_logs").insert({
    woo_order_id,
    order_number: existing.order_number,
    previous_status: currentStatus,
    new_status: statusOk ? "shipped" : currentStatus,
    changed_by: userId,
    changed_by_email: userEmail,
    source: "xboom_ui_tracking",
    woo_api_success: trackingOk && statusOk,
    woo_api_response: { tracking: trackingResp, native_provider: native, tracking_body: trackingBody },
    error_message: [trackingErr, statusErr].filter(Boolean).join(" | ") || null,
  });

  return new Response(JSON.stringify({
    success: true,
    tracking_pushed: trackingOk,
    status_updated: statusOk,
    provider_used: native || `custom:${label}`,
    warning: !trackingOk || !statusOk
      ? [trackingErr, statusErr].filter(Boolean).join(" | ")
      : null,
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});