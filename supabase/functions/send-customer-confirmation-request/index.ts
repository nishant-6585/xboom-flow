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
    //  - Existing portal customer (activated auth user) → yes, direct link.
    //  - No activated portal user OR only an expired unused invite exists →
    //    delegate to kyc-handler onboardOrder(force=true) so the customer
    //    gets a fresh invite + confirmation ask in the SAME email. Otherwise
    //    they receive a /portal/confirm link they cannot log into (root
    //    cause of the July 2026 confirmation drop-off).
    let hasExistingPortalUser = false;
    let needsFreshInvite = false;
    if (order.customer_email) {
      const { data: existingContact } = await admin
        .from("portal_contacts")
        .select("auth_user_id")
        .ilike("email", order.customer_email)
        .not("auth_user_id", "is", null)
        .maybeSingle();
      hasExistingPortalUser = !!existingContact?.auth_user_id;
      if (!hasExistingPortalUser) {
        // Look for an unused non-expired invite; if none, we need to mint one.
        const { data: liveInvite } = await admin
          .from("portal_invite_tokens")
          .select("token, expires_at, used_at")
          .ilike("email", order.customer_email)
          .is("used_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        needsFreshInvite = !liveInvite;
      }
    }

    // Fire onboard_order (force) for customers without portal access so the
    // onboarding+confirmation email goes out with a live invite link.
    if (needsFreshInvite) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/kyc-handler`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE}`,
            apikey: SERVICE_ROLE,
          },
          body: JSON.stringify({
            action: "onboard_order",
            order_id: order.id,
            interactive: true,
          }),
        });
        result.email = r.ok ? "sent_via_onboarding_fresh_invite" : `onboarding_failed:${r.status}`;
        await admin.from("order_notifications").insert({
          order_ref: order.id, order_source: "internal",
          order_number: orderNumber, status_trigger: "confirmation_request",
          channel: "email", template_name: "confirmation_request_email",
          payload: { customer_name: customerName, order_number: orderNumber, link, delivered_via: "onboarding_fresh_invite" },
          status: r.ok ? "sent" : "failed",
          sent_at: r.ok ? new Date().toISOString() : null,
          error_message: r.ok ? null : `kyc-handler http ${r.status}`,
          provider: "platform",
        });
      } catch (e) {
        result.email = "onboarding_error";
        console.error("[send-customer-confirmation-request] onboarding invoke failed", e);
      }
    }

    // ----- Email via Resend -----
    if (order.customer_email && hasExistingPortalUser) {
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
          payload: { customer_name: customerName, order_number: orderNumber, link },
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
    } else if (!hasExistingPortalUser && !needsFreshInvite) {
      // Live unused invite already exists — that email carries the ask.
      result.email = "sent_via_onboarding";
      await admin.from("order_notifications").insert({
        order_ref: order.id, order_source: "internal",
        order_number: orderNumber, status_trigger: "confirmation_request",
        channel: "email", template_name: "confirmation_request_email",
        payload: { customer_name: customerName, order_number: orderNumber, link, delivered_via: "onboarding_email" },
        status: "skipped",
        error_message: "sent_via_onboarding",
        provider: "platform",
      });
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
