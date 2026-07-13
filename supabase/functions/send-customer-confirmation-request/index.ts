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

// Portal base for activation links. Kept in sync with kyc-handler's PORTAL_BASE.
const PORTAL_BASE = "https://xboomflow.com";

/** Ensure a portal_account + auth user + portal_contact exist for `email`,
 *  then mint (or reuse) a live non-consuming invite token pointing at
 *  /portal/activate. Drone-agnostic — this is the safety net for ANY website
 *  order landing without portal access so the customer can log in and
 *  confirm. Never throws; returns null on failure. */
async function ensurePortalInvite(
  admin: ReturnType<typeof createClient>,
  order: { id: string; customer_email: string | null; customer_name: string | null; customer_company?: string | null; sales_person_id?: string | null },
): Promise<{ activation_link: string; created_portal: boolean } | null> {
  const email = (order.customer_email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  const { data: contact } = await admin
    .from("portal_contacts")
    .select("id, account_id, auth_user_id")
    .ilike("email", email)
    .maybeSingle();

  let acctId: string | null = contact?.account_id ?? null;
  let authUserId: string | null = contact?.auth_user_id ?? null;
  const createdPortal = !contact?.auth_user_id;

  if (!contact?.auth_user_id) {
    // Create account if missing
    if (!acctId) {
      const { data: acct, error: acctErr } = await admin
        .from("portal_accounts")
        .insert({
          company_name: order.customer_company || order.customer_name || "Customer",
          primary_contact_name: order.customer_name || null,
          assigned_rep_id: order.sales_person_id ?? null,
          status: "active",
        })
        .select("id").single();
      if (acctErr) { console.error("[ensurePortalInvite] account create failed", acctErr); return null; }
      acctId = acct.id;
    }

    // Create or find auth user
    if (!authUserId) {
      const tempPassword = crypto.randomUUID().slice(0, 16) + "Aa1!";
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email, password: tempPassword, email_confirm: true,
        user_metadata: { full_name: order.customer_name, portal: true },
      });
      if (createErr && /already.*registered|already exists/i.test(createErr.message)) {
        let page = 1;
        while (!authUserId) {
          const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 100 });
          const found = list?.users?.find((u: any) => u.email?.toLowerCase() === email);
          if (found) { authUserId = found.id; break; }
          if (!list?.users || list.users.length < 100) break;
          page++;
        }
      } else if (createErr) {
        console.error("[ensurePortalInvite] auth user create failed", createErr);
        return null;
      } else {
        authUserId = created!.user.id;
      }
    }
    if (!authUserId || !acctId) return null;

    // Create or link contact
    if (!contact) {
      await admin.from("portal_contacts").insert({
        account_id: acctId, auth_user_id: authUserId,
        full_name: order.customer_name || email.split("@")[0],
        email, role: "admin", is_active: true,
        invited_at: new Date().toISOString(),
      });
    } else if (!contact.auth_user_id) {
      await admin.from("portal_contacts").update({ auth_user_id: authUserId }).eq("id", contact.id);
    }
    await admin.from("user_roles").upsert(
      { user_id: authUserId, role: "b2b_customer" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
  }
  if (!authUserId || !acctId) return null;

  // Reuse a live unused invite if one exists; else mint fresh (7-day expiry).
  let token: string | null = null;
  const { data: liveInvite } = await admin
    .from("portal_invite_tokens")
    .select("token")
    .ilike("email", email)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  if (liveInvite?.token) {
    token = liveInvite.token;
  } else {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: inv, error: invErr } = await admin.from("portal_invite_tokens")
      .insert({ auth_user_id: authUserId, email, account_id: acctId, expires_at: expiresAt })
      .select("token").single();
    if (invErr) { console.error("[ensurePortalInvite] invite mint failed", invErr); return null; }
    token = inv.token;
  }
  return { activation_link: `${PORTAL_BASE}/portal/activate?invite=${encodeURIComponent(token!)}`, created_portal: createdPortal };
}

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
