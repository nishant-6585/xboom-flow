// Portal notification dispatcher.
// Single entry point that fans out a portal event to email (Resend) and
// WhatsApp (Interakt) for every active contact on the related portal account.
//
// Supported event_type values:
//   - order_state_changed     payload: { order_id, customer_facing_note?, public_url? }
//   - rfq_submitted           payload: { rfq_id }                  (notifies assigned rep + sales managers)
//   - rfq_assigned            payload: { rfq_id }                  (notifies customer)
//   - ticket_created          payload: { ticket_id }               (notifies internal assignees)
//   - ticket_message_added    payload: { ticket_id, message_id }   (notifies the *other* side)
//
// Resend-only for internal staff (no WhatsApp). Customers get both when a
// whatsapp_number is on file.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail as sendMailSeam } from "../_shared/email.ts";
import { resolveRecipients } from "../_shared/staff-routing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const INTERAKT_API_KEY = Deno.env.get("INTERAKT_API_KEY");
const PORTAL_BASE_URL =
  Deno.env.get("PORTAL_BASE_URL") ?? "https://xboomflow.com/portal";
const STAFF_BASE_URL = "https://xboomflow.com";
// Public "write a review" link for the Xboom Google Business listing.
// Override with the GOOGLE_REVIEW_URL secret if the listing ever changes.
const GOOGLE_REVIEW_URL =
  Deno.env.get("GOOGLE_REVIEW_URL") ??
  "https://g.page/r/CfJDbEcul78fEBM/review";
// QR image (served from the app's public/ folder) encoding the same link.
const GOOGLE_REVIEW_QR_URL = `${STAFF_BASE_URL}/google-review-qr.png`;

/**
 * Per-state WhatsApp template mapping.
 * Each template receives 3 body values: [contact_name, order_number, human_state_or_extra].
 * Falls back to the generic `portal_order_update` template when a state is
 * not explicitly mapped (covers internal/no-op states like draft/closed).
 */
const ORDER_STATE_TEMPLATES: Record<string, string> = {
  quote_sent: "portal_quote_sent",
  quote_revised: "portal_quote_revised",
  approved: "portal_order_update",
  po_received: "portal_order_update",
  confirmed: "portal_order_confirmed",
  in_production: "portal_order_in_production",
  qc_ready: "portal_order_update",
  dispatched: "portal_order_dispatched",
  delivered: "portal_order_delivered",
  cancelled: "portal_order_update",
};

function templateForState(state: string): string {
  return ORDER_STATE_TEMPLATES[state] ?? "portal_order_update";
}

type EventType =
  | "order_state_changed"
  | "rfq_submitted"
  | "rfq_assigned"
  | "ticket_created"
  | "ticket_message_added";

interface Body {
  event_type: EventType;
  payload: Record<string, unknown>;
}

interface Recipient {
  id?: string;
  full_name: string | null;
  email: string | null;
  whatsapp_number: string | null;
  phone: string | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendEmail(
  to: string,
  templateName: string,
  templateData: Record<string, unknown>,
  idempotencyKey: string,
) {
  const r = await sendMailSeam({
    provider: "platform",
    to,
    subject: "",
    html: "",
    templateName,
    templateData,
    idempotencyKey,
  });
  if (!r.ok) return { ok: false, error: `${r.status} ${r.error ?? ""}`.trim() };
  return { ok: true, data: r.raw };
}

async function sendWhatsApp(
  phone: string,
  templateName: string,
  bodyValues: string[],
) {
  if (!INTERAKT_API_KEY) return { ok: false, error: "INTERAKT_API_KEY missing" };
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 10) return { ok: false, error: "invalid phone" };
  const countryCode = digits.length === 10 ? "91" : digits.slice(0, digits.length - 10);
  const phoneNumber = digits.slice(-10);
  try {
    const res = await fetch("https://api.interakt.ai/v1/public/message/", {
      method: "POST",
      headers: {
        Authorization: `Basic ${INTERAKT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        countryCode,
        phoneNumber,
        callbackData: `portal_${Date.now()}`,
        type: "Template",
        template: {
          name: templateName,
          languageCode: "en",
          bodyValues,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `${res.status} ${JSON.stringify(data)}` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// htmlWrap removed — copy now lives in React Email templates registered in
// _shared/transactional-email-templates. Kept the file layout otherwise
// identical (WhatsApp/Interakt branch untouched).

async function getAccountContacts(
  admin: ReturnType<typeof createClient>,
  account_id: string,
): Promise<Recipient[]> {
  const { data } = await admin
    .from("portal_contacts")
    .select("id, full_name, email, whatsapp_number, phone")
    .eq("account_id", account_id)
    .eq("is_active", true);
  return ((data ?? []) as unknown) as Recipient[];
}

type PrefKey =
  | "order_status"
  | "supply_chain_notes"
  | "new_docs"
  | "ticket_replies"
  | "renewals";

/**
 * Returns a map { contact_id -> { email: bool, whatsapp: bool } } for the given pref category.
 * If a contact has no row, defaults to true/true (sensible defaults match the table defaults).
 */
async function getPrefMap(
  admin: ReturnType<typeof createClient>,
  contactIds: string[],
  category: PrefKey,
): Promise<Record<string, { email: boolean; whatsapp: boolean }>> {
  const out: Record<string, { email: boolean; whatsapp: boolean }> = {};
  for (const id of contactIds) out[id] = { email: true, whatsapp: category !== "new_docs" };
  if (contactIds.length === 0) return out;
  const emailCol = `email_${category}`;
  const waCol = `whatsapp_${category}`;
  const { data } = await admin
    .from("portal_notification_preferences")
    .select(`contact_id, ${emailCol}, ${waCol}`)
    .in("contact_id", contactIds);
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const cid = row.contact_id as string;
    out[cid] = {
      email: row[emailCol] !== false,
      whatsapp: row[waCol] !== false,
    };
  }
  return out;
}

async function getStaffEmails(
  admin: ReturnType<typeof createClient>,
  userIds: (string | null | undefined)[],
): Promise<string[]> {
  const ids = userIds.filter((u): u is string => !!u);
  if (ids.length === 0) return [];
  // Fetch from auth.users via admin API
  const out: string[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      const { data } = await admin.auth.admin.getUserById(id);
      if (data?.user?.email) out.push(data.user.email);
    } catch {
      /* ignore */
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Authenticated callers only (any logged-in user — RLS does the rest)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Missing authorization" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Role guard: only operational roles may trigger customer notifications.
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  const allowedRoles = new Set(["admin", "supply_chain", "sales", "sales_manager", "support"]);
  const hasAllowedRole = (roleRows ?? []).some((r: { role: string }) => allowedRoles.has(r.role));
  if (!hasAllowedRole) return json({ error: "Forbidden" }, 403);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body?.event_type) return json({ error: "event_type required" }, 400);

  const results: Array<{ channel: string; to: string; ok: boolean; error?: string }> = [];

  try {
    switch (body.event_type) {
      case "order_state_changed": {
        const orderId = String(body.payload.order_id ?? "");
        if (!orderId) return json({ error: "order_id required" }, 400);
        const { data: order } = await admin
          .from("portal_orders")
          .select("order_number, account_id, current_state, customer_facing_eta")
          .eq("id", orderId)
          .maybeSingle();
        if (!order) return json({ error: "Order not found" }, 404);
        const o = order as { order_number: string; account_id: string; current_state: string; customer_facing_eta: string | null };
        const note = String(body.payload.customer_facing_note ?? "");
        const url = `${PORTAL_BASE_URL}/orders/${orderId}`;
        const contacts = await getAccountContacts(admin, o.account_id);
        const prefs = await getPrefMap(admin, contacts.map((c) => c.id!).filter(Boolean), "order_status");
        for (const c of contacts) {
          const p = c.id ? prefs[c.id] : { email: true, whatsapp: true };
          if (c.email && p.email) {
            const r = await sendEmail(
              c.email,
              "portal-order-state",
              {
                order_number: o.order_number,
                current_state: o.current_state,
                customer_facing_note: note || undefined,
                customer_facing_eta: o.customer_facing_eta || undefined,
                order_url: url,
              },
              `portal-notify:order_state_changed:${orderId}:${o.current_state}:${c.email}`,
            );
            results.push({ channel: "email", to: c.email, ok: r.ok, error: r.error });
          }
          if (c.whatsapp_number && p.whatsapp) {
            const templateName = templateForState(o.current_state);
            const thirdValue =
              o.current_state === "dispatched" || o.current_state === "in_production" || o.current_state === "confirmed"
                ? (o.customer_facing_eta ?? o.current_state.replace(/_/g, " "))
                : o.current_state.replace(/_/g, " ");
            const r = await sendWhatsApp(c.whatsapp_number, templateName, [
              c.full_name ?? "Customer",
              o.order_number,
              thirdValue,
            ]);
            results.push({ channel: "whatsapp", to: c.whatsapp_number, ok: r.ok, error: r.error });
          }
        }
        // Delivered orders additionally get a feedback + Google review ask.
        if (o.current_state === "delivered") {
          for (const c of contacts) {
            const p = c.id ? prefs[c.id] : { email: true, whatsapp: true };
            if (!c.email || !p.email) continue;
            const r = await sendEmail(
              c.email,
              "portal-order-delivered-feedback",
              {
                order_number: o.order_number,
                contact_name: c.full_name ?? undefined,
                feedback_url: `${PORTAL_BASE_URL}/feedback?order=${orderId}`,
                google_review_url: GOOGLE_REVIEW_URL,
                google_review_qr_url: GOOGLE_REVIEW_QR_URL,
              },
              `portal-notify:order_delivered_feedback:${orderId}:${c.email}`,
            );
            results.push({ channel: "email", to: c.email, ok: r.ok, error: r.error });
          }
        }
        break;
      }

      case "rfq_submitted": {
        const rfqId = String(body.payload.rfq_id ?? "");
        const { data: rfq } = await admin
          .from("portal_rfqs")
          .select("rfq_number, use_case, account_id, assigned_rep_id, account:portal_accounts(company_name, assigned_rep_id)")
          .eq("id", rfqId)
          .maybeSingle();
        if (!rfq) return json({ error: "RFQ not found" }, 404);
        const r = rfq as { rfq_number: string; use_case: string; assigned_rep_id: string | null; account: { company_name: string; assigned_rep_id: string | null } | null };
        const { emails, reasons } = await resolveRecipients(admin, "rfq_submitted", {
          assignee: r.assigned_rep_id,
          accountRep: r.account?.assigned_rep_id ?? null,
        });
        console.log(`[portal-notify] rfq_submitted ${rfqId} recipients=${emails.length} reasons=${reasons.join(",")}`);
        for (const e of emails) {
          const res = await sendEmail(
            e,
            "portal-rfq-submitted",
            {
              rfq_number: r.rfq_number,
              company_name: r.account?.company_name ?? "customer",
              use_case: r.use_case,
              admin_url: `${STAFF_BASE_URL}/admin/portal-rfqs`,
            },
            `portal-notify:rfq_submitted:${rfqId}:${e}`,
          );
          results.push({ channel: "email", to: e, ok: res.ok, error: res.error });
        }
        break;
      }

      case "rfq_assigned": {
        const rfqId = String(body.payload.rfq_id ?? "");
        const { data: rfq } = await admin
          .from("portal_rfqs")
          .select("rfq_number, account_id")
          .eq("id", rfqId)
          .maybeSingle();
        if (!rfq) return json({ error: "RFQ not found" }, 404);
        const r = rfq as { rfq_number: string; account_id: string };
        const contacts = await getAccountContacts(admin, r.account_id);
        const prefs = await getPrefMap(admin, contacts.map((c) => c.id!).filter(Boolean), "order_status");
        for (const c of contacts) {
          if (!c.email) continue;
          if (c.id && !prefs[c.id]?.email) continue;
          const res = await sendEmail(
            c.email,
            "portal-rfq-assigned",
            { rfq_number: r.rfq_number },
            `portal-notify:rfq_assigned:${rfqId}:${c.email}`,
          );
          results.push({ channel: "email", to: c.email, ok: res.ok, error: res.error });
        }
        break;
      }

      case "ticket_created": {
        const ticketId = String(body.payload.ticket_id ?? "");
        const { data: t } = await admin
          .from("portal_tickets")
          .select("ticket_number, subject, priority, ticket_type, assigned_to, account_id, account:portal_accounts(company_name, assigned_rep_id)")
          .eq("id", ticketId)
          .maybeSingle();
        if (!t) return json({ error: "Ticket not found" }, 404);
        const tk = t as { ticket_number: string; subject: string; priority: string; ticket_type: string | null; assigned_to: string | null; account: { company_name: string; assigned_rep_id: string | null } | null };
        const { emails, reasons } = await resolveRecipients(admin, "ticket_created", {
          assignee: tk.assigned_to,
          accountRep: tk.account?.assigned_rep_id ?? null,
          ticketType: tk.ticket_type,
        });
        console.log(`[portal-notify] ticket_created ${ticketId} recipients=${emails.length} reasons=${reasons.join(",")}`);
        for (const e of emails) {
          const res = await sendEmail(
            e,
            "portal-ticket-created",
            {
              ticket_number: tk.ticket_number,
              subject: tk.subject,
              priority: tk.priority,
              company_name: tk.account?.company_name ?? "—",
              ticket_url: `${STAFF_BASE_URL}/admin/portal-tickets/${ticketId}`,
            },
            `portal-notify:ticket_created:${ticketId}:${e}`,
          );
          results.push({ channel: "email", to: e, ok: res.ok, error: res.error });
        }
        break;
      }

      case "ticket_message_added": {
        const ticketId = String(body.payload.ticket_id ?? "");
        const messageId = String(body.payload.message_id ?? "");
        const { data: t } = await admin
          .from("portal_tickets")
          .select("ticket_number, subject, ticket_type, account_id, assigned_to, raised_by_contact_id, account:portal_accounts(company_name, assigned_rep_id)")
          .eq("id", ticketId)
          .maybeSingle();
        const { data: m } = await admin
          .from("portal_ticket_messages")
          .select("body, sender_id, sender_name_snapshot, is_internal")
          .eq("id", messageId)
          .maybeSingle();
        if (!t || !m) return json({ error: "Ticket/message not found" }, 404);
        const tk = t as { ticket_number: string; subject: string; ticket_type: string | null; account_id: string; assigned_to: string | null; raised_by_contact_id: string | null; account: { company_name: string; assigned_rep_id: string | null } | null };
        const msg = m as { body: string; sender_id: string | null; sender_name_snapshot: string | null; is_internal: boolean };
        if (msg.is_internal) {
          // Internal notes are non-notifying by design — no email/WhatsApp
          // fanout, no template. Staff see internal notes in the ticket UI.
          break;
        }
        // Determine if sender is staff or customer
        const { data: portalContact } = await admin
          .from("portal_contacts")
          .select("id")
          .eq("auth_user_id", msg.sender_id ?? "")
          .maybeSingle();
        const senderIsCustomer = !!portalContact;

        if (senderIsCustomer) {
          // notify staff
          const { emails, reasons } = await resolveRecipients(admin, "ticket_reply_to_staff", {
            assignee: tk.assigned_to,
            accountRep: tk.account?.assigned_rep_id ?? null,
            ticketType: tk.ticket_type,
          });
          console.log(`[portal-notify] ticket_reply_to_staff ${ticketId} recipients=${emails.length} reasons=${reasons.join(",")}`);
          for (const e of emails) {
            const res = await sendEmail(
              e,
              "portal-ticket-reply-to-staff",
              {
                ticket_number: tk.ticket_number,
                subject: tk.subject,
                sender_name: msg.sender_name_snapshot ?? "Customer",
                body: msg.body,
                ticket_url: `${STAFF_BASE_URL}/admin/portal-tickets/${ticketId}`,
              },
              `portal-notify:ticket_message_added:${messageId}:${e}`,
            );
            results.push({ channel: "email", to: e, ok: res.ok, error: res.error });
          }
        } else {
          // notify customer contacts
          const contacts = await getAccountContacts(admin, tk.account_id);
          const prefs = await getPrefMap(admin, contacts.map((c) => c.id!).filter(Boolean), "ticket_replies");
          for (const c of contacts) {
            if (!c.email) continue;
            if (c.id && !prefs[c.id]?.email) continue;
            const res = await sendEmail(
              c.email,
              "portal-ticket-reply-to-customer",
              {
                ticket_number: tk.ticket_number,
                body: msg.body,
                ticket_url: `${PORTAL_BASE_URL}/tickets/${ticketId}`,
              },
              `portal-notify:ticket_message_added:${messageId}:${c.email}`,
            );
            results.push({ channel: "email", to: c.email, ok: res.ok, error: res.error });
          }
          // WhatsApp ticket-reply notification
          for (const c of contacts) {
            if (!c.whatsapp_number) continue;
            if (c.id && !prefs[c.id]?.whatsapp) continue;
            const res = await sendWhatsApp(c.whatsapp_number, "portal_ticket_response", [
              c.full_name ?? "Customer",
              tk.ticket_number,
              (msg.body ?? "").slice(0, 120),
            ]);
            results.push({ channel: "whatsapp", to: c.whatsapp_number, ok: res.ok, error: res.error });
          }
        }
        break;
      }

      default:
        return json({ error: `Unknown event_type: ${body.event_type}` }, 400);
    }

    return json({ ok: true, sent: results.length, results });
  } catch (e) {
    console.error("[portal-notify] error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});