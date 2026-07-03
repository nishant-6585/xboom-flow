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

    const auth = req.headers.get("Authorization") || "";
    const isServiceRole = auth.includes(SERVICE_ROLE);

    // Gate non-service-role callers to admin/sales/sales_manager.
    if (!isServiceRole) {
      const anonClient = createClient(
        SUPABASE_URL,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } },
      );
      const { data: userRes } = await anonClient.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
      const rset = new Set((roles || []).map((r: any) => r.role));
      const allowed = rset.has("admin") || rset.has("sales") || rset.has("sales_manager");
      if (!allowed) {
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

    // ----- Email via Resend -----
    if (order.customer_email && RESEND_API_KEY) {
      try {
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
            <h2 style="margin:0 0 12px">Please confirm your order</h2>
            <p>Hi ${escapeHtml(customerName)},</p>
            <p>Thank you for your order <strong>${escapeHtml(orderNumber)}</strong> with Xboom.</p>
            <p>Because this order includes items that ship as a larger consignment, we need
            you to confirm the order before we dispatch. Please log into your Xboom customer
            portal and click <em>Confirm your order</em>.</p>
            <p style="text-align:center;margin:28px 0">
              <a href="${link}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">
                Confirm your order
              </a>
            </p>
            <p style="color:#555;font-size:13px">Or open this link:<br/><a href="${link}">${link}</a></p>
            <p style="color:#888;font-size:12px;margin-top:32px">Xboom · Order ${escapeHtml(orderNumber)}</p>
          </div>`;
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "Xboom Orders <orders@xboomflow.com>",
            to: [order.customer_email],
            subject: `Action required: confirm your Xboom order ${orderNumber}`,
            html,
          }),
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
