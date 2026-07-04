// send-customer-confirmation-request
// Triggers customer email (Resend) + SMS queue (order_notifications → MSG91)
// for weight-gated orders that need customer confirmation.
//
// Callable by:
//  - authenticated admin / sales / sales_manager (Resend button in OrderDialog)
//  - service role (internal callers such as useOrders create path or woo-mirror)
//
// Never throws when a channel fails; logs into order_notifications.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendEmail as sendMailSeam } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

interface Body { order_id: string }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const auth = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    const isServiceRole = auth.includes(SERVICE_ROLE);

    // Gate non-service-role callers to admin/sales/sales_manager.
    if (!isServiceRole) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
      const bearerToken = auth.replace(/^Bearer\s+/i, "").trim();
      const anonClient = createClient(
        SUPABASE_URL,
        anonKey,
        { global: { headers: { Authorization: auth } } },
      );
      const { data: userRes, error: userErr } = await anonClient.auth.getUser(bearerToken);
      const uid = userRes?.user?.id;
      if (!uid) {
        console.warn("[send-customer-confirmation-request] unauthorized", {
          hasAuthHeader: !!auth,
          authScheme: auth ? auth.split(/\s+/)[0] : null,
          hasAnonKey: !!anonKey,
          userError: userErr?.message || null,
        });
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
      const rset = new Set((roles || []).map((r: any) => r.role));
      const allowed = rset.has("admin") || rset.has("sales") || rset.has("sales_manager");
      if (!allowed) {
        console.warn("[send-customer-confirmation-request] forbidden", { uid, roles: Array.from(rset) });
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = (await req.json()) as Body;
    if (!body?.order_id) {
      return new Response(JSON.stringify({ error: "order_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("id, order_number, customer_name, customer_email, customer_phone, confirmation_status")
      .eq("id", body.order_id)
      .maybeSingle();
    if (oErr || !order) {
      return new Response(JSON.stringify({ error: "order not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (order.confirmation_status === "confirmed") {
      return new Response(JSON.stringify({ ok: true, skipped: "already_confirmed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orderNumber = order.order_number || order.id;
    const customerName = order.customer_name || "Customer";
    const link = `https://xboomflow.com/portal/confirm`;
    const result: Record<string, unknown> = { email: null, sms: null };

    // Decide whether to send a standalone confirmation email.
    //  - Existing portal customer (already has an activated auth user) → yes, they
    //    won't receive the onboarding email so this is their only nudge.
    //  - Brand-new customer → NO. kyc-handler's onboardOrder folds the confirmation
    //    ask into the single onboarding email so we don't double-mail them.
    let hasExistingPortalUser = false;
    if (order.customer_email) {
      const { data: existingContact } = await admin
        .from("portal_contacts")
        .select("auth_user_id")
        .ilike("email", order.customer_email)
        .not("auth_user_id", "is", null)
        .maybeSingle();
      hasExistingPortalUser = !!existingContact?.auth_user_id;
    }

    // ----- Email via Resend -----
    if (order.customer_email && RESEND_API_KEY && hasExistingPortalUser) {
      try {
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
            <h2 style="margin:0 0 12px">Please confirm your order</h2>
            <p>Hi ${escapeHtml(customerName)},</p>
            <p>Thank you for your order <strong>${escapeHtml(orderNumber)}</strong> with Xboom.</p>
            <p>Because this order includes a drone, we need you to confirm the order
            before we dispatch. Please log into your Xboom customer portal and click
            <em>Confirm your order</em>.</p>
            <p style="text-align:center;margin:28px 0">
              <a href="${link}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">
                Confirm your order
              </a>
            </p>
            <p style="color:#555;font-size:13px">Or open this link:<br/><a href="${link}">${link}</a></p>
            <p style="color:#888;font-size:12px;margin-top:32px">Xboom · Order ${escapeHtml(orderNumber)}</p>
          </div>`;
        const resp = await sendMailSeam({
          to: order.customer_email,
          subject: `Action required: confirm your Xboom order ${orderNumber}`,
          html,
        });
        const ok = resp.ok;
        result.email = ok ? "sent" : `failed:${resp.status}`;
        await admin.from("order_notifications").insert({
          order_ref: order.id, order_source: "internal",
          order_number: orderNumber, status_trigger: "confirmation_request",
          channel: "email",
          template_name: "confirmation_request_email",
          payload: { customer_name: customerName, order_number: orderNumber, link },
          status: ok ? "sent" : "failed",
          sent_at: ok ? new Date().toISOString() : null,
          error_message: ok ? null : `resend http ${resp.status}`,
          provider: "resend",
        });
      } catch (e) {
        result.email = "error";
        console.error("[send-customer-confirmation-request] email failed", e);
        await admin.from("order_notifications").insert({
          order_ref: order.id, order_source: "internal",
          order_number: orderNumber, status_trigger: "confirmation_request",
          channel: "email", template_name: "confirmation_request_email",
          payload: { customer_name: customerName, order_number: orderNumber, link },
          status: "failed",
          error_message: e instanceof Error ? e.message : String(e),
          provider: "resend",
        });
      }
    } else if (!order.customer_email) {
      result.email = "no_email";
    } else if (!hasExistingPortalUser) {
      // New customer: onboarding email (sent by kyc-handler) carries the
      // confirmation ask, so we skip and log it for the audit trail.
      result.email = "sent_via_onboarding";
      await admin.from("order_notifications").insert({
        order_ref: order.id, order_source: "internal",
        order_number: orderNumber, status_trigger: "confirmation_request",
        channel: "email", template_name: "confirmation_request_email",
        payload: { customer_name: customerName, order_number: orderNumber, link, delivered_via: "onboarding_email" },
        status: "skipped",
        error_message: "sent_via_onboarding",
        provider: "resend",
      });
    } else {
      result.email = "no_resend_key";
    }

    // ----- SMS via MSG91 queue -----
    if (order.customer_phone) {
      try {
        await admin.from("order_notifications").insert({
          order_ref: order.id, order_source: "internal",
          order_number: orderNumber, status_trigger: "confirmation_request",
          channel: "sms", phone: order.customer_phone,
          template_name: "confirmation_request",
          payload: { customer_name: customerName, order_number: orderNumber, link },
          provider: "msg91",
        });
        result.sms = "queued";
      } catch (e) {
        result.sms = "error";
        console.error("[send-customer-confirmation-request] sms enqueue failed", e);
      }
    } else {
      result.sms = "no_phone";
    }

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[send-customer-confirmation-request] unhandled", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
