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
import { ensurePortalInvite } from "../_shared/portal-invite.ts";

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
      .select("id, order_number, customer_name, customer_email, customer_phone, customer_company, sales_person_id, confirmation_status, requires_confirmation")
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
    // Defense in depth: this endpoint sends the "confirm your order" ask.
    // Non-drone orders (requires_confirmation=false) must never receive it,
    // even if a staff user clicks Resend from the OrderDialog. Portal
    // access for those customers is handled by the woo-mirror portal-welcome
    // path, not here.
    if (order.requires_confirmation === false) {
      return new Response(JSON.stringify({ ok: true, skipped: "not_required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orderNumber = order.order_number || order.id;
    const customerName = order.customer_name || "Customer";
    const link = `https://xboomflow.com/portal/confirm`;
    const result: Record<string, unknown> = { email: null, sms: null };

    // Ensure the customer has portal access before we send the "confirm" link.
    // If they don't, mint an invite and include an activation link in the
    // same email so they can actually reach the confirm page. This is
    // drone-agnostic — kyc-handler's onboard_order is drone-gated and would
    // otherwise skip website orders like a spare-parts purchase.
    let activationLink: string | undefined;
    let createdPortal = false;
    const ensured = await ensurePortalInvite(admin, order as any);
    if (ensured) {
      activationLink = ensured.activation_link;
      createdPortal = ensured.created_portal;
    }

    // ----- Email via Resend -----
    if (order.customer_email) {
      try {
        // Stable idempotency: identity is the order + trigger. order_notifications
        // is our log-of-record for this trigger; the row id changes per attempt
        // (Resend button), so include a monotonically-increasing attempt counter
        // derived from the existing log rows for this order+trigger.
        const { count: priorAttempts } = await admin
          .from("order_notifications")
          .select("id", { count: "exact", head: true })
          .eq("order_ref", order.id)
          .eq("status_trigger", "confirmation_request")
          .eq("channel", "email");
        const attemptIdx = (priorAttempts ?? 0) + 1;
        const idempotencyKey = `send-customer-confirmation-request:email:${order.id}:${attemptIdx}`;
        const resp = await sendMailSeam({
          provider: "platform",
          to: order.customer_email,
          subject: "",
          html: "",
          templateName: "customer-confirmation-request",
          templateData: {
            customer_name: customerName,
            order_number: orderNumber,
            link,
            // Only include activation_link when the recipient has no active
            // portal password yet (created_portal === true means we just
            // minted the auth user / linked the contact).
            ...(activationLink && createdPortal ? { activation_link: activationLink } : {}),
          },
          idempotencyKey,
          // Human-triggered from the order UI (Send/Resend). Nudge the queue
          // worker so the row flips to `sent` within seconds instead of
          // waiting on the next cron tick. Retries/dedup/logging unchanged.
          interactive: true,
        });
        const ok = resp.ok;
        result.email = ok ? "sent" : `failed:${resp.status}`;
        await admin.from("order_notifications").insert({
          order_ref: order.id, order_source: "internal",
          order_number: orderNumber, status_trigger: "confirmation_request",
          channel: "email",
          template_name: "confirmation_request_email",
          payload: { customer_name: customerName, order_number: orderNumber, link, activation_included: !!(activationLink && createdPortal) },
          status: ok ? "sent" : "failed",
          sent_at: ok ? new Date().toISOString() : null,
          error_message: ok ? null : `platform http ${resp.status}`,
          provider: "platform",
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
          provider: "platform",
        });
      }
    } else if (!order.customer_email) {
      result.email = "no_email";
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
