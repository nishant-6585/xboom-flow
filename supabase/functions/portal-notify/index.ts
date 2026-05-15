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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const INTERAKT_API_KEY = Deno.env.get("INTERAKT_API_KEY");
const FROM_ADDRESS = "XBOOM Flow <notifications@xboom.in>";
const PORTAL_BASE_URL =
  Deno.env.get("PORTAL_BASE_URL") ?? "https://xboomflow.com/portal";

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

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY missing" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `${res.status} ${JSON.stringify(data)}` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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

function htmlWrap(title: string, inner: string) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#fff;color:#1a1a2e;padding:24px">
    <div style="max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
      <h2 style="margin:0 0 12px;font-size:20px;color:#0c2340">${title}</h2>
      ${inner}
      <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0"/>
      <p style="font-size:12px;color:#6b7280;margin:0">XBOOM Flow Customer Portal</p>
    </div>
  </body></html>`;
}

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
        const subject = `Order ${o.order_number} update: ${o.current_state.replace(/_/g, " ")}`;
        const html = htmlWrap(
          subject,
          `<p>Hi,</p><p>Your order <strong>${o.order_number}</strong> is now <strong>${o.current_state.replace(/_/g, " ")}</strong>.</p>${note ? `<p style="background:#f3f4f6;padding:12px;border-radius:8px">${note}</p>` : ""}${o.customer_facing_eta ? `<p>Expected by <strong>${o.customer_facing_eta}</strong>.</p>` : ""}<p><a href="${url}" style="background:#0c2340;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">View order</a></p>`,
        );
        for (const c of contacts) {
          const p = c.id ? prefs[c.id] : { email: true, whatsapp: true };
          if (c.email && p.email) {
            const r = await sendEmail(c.email, subject, html);
            results.push({ channel: "email", to: c.email, ok: r.ok, error: r.error });
          }
          if (c.whatsapp_number && p.whatsapp) {
            const r = await sendWhatsApp(c.whatsapp_number, "portal_order_update", [
              c.full_name ?? "Customer",
              o.order_number,
              o.current_state.replace(/_/g, " "),
            ]);
            results.push({ channel: "whatsapp", to: c.whatsapp_number, ok: r.ok, error: r.error });
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
        const repIds = [r.assigned_rep_id, r.account?.assigned_rep_id];
        const emails = await getStaffEmails(admin, repIds);
        const subject = `New RFQ ${r.rfq_number} from ${r.account?.company_name ?? "customer"}`;
        const html = htmlWrap(
          subject,
          `<p><strong>${r.account?.company_name ?? "—"}</strong> just submitted an RFQ.</p><p style="background:#f3f4f6;padding:12px;border-radius:8px;white-space:pre-wrap">${r.use_case}</p><p><a href="https://xboomflow.com/admin/portal-rfqs">Open queue</a></p>`,
        );
        for (const e of emails) {
          const res = await sendEmail(e, subject, html);
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
        const subject = `Your RFQ ${r.rfq_number} is being worked on`;
        const html = htmlWrap(
          subject,
          `<p>Good news — our team has picked up <strong>${r.rfq_number}</strong> and will share a quote shortly.</p>`,
        );
        for (const c of contacts) {
          if (!c.email) continue;
          if (c.id && !prefs[c.id]?.email) continue;
          const res = await sendEmail(c.email, subject, html);
          results.push({ channel: "email", to: c.email, ok: res.ok, error: res.error });
        }
        break;
      }

      case "ticket_created": {
        const ticketId = String(body.payload.ticket_id ?? "");
        const { data: t } = await admin
          .from("portal_tickets")
          .select("ticket_number, subject, priority, assigned_to, account_id, account:portal_accounts(company_name, assigned_rep_id)")
          .eq("id", ticketId)
          .maybeSingle();
        if (!t) return json({ error: "Ticket not found" }, 404);
        const tk = t as { ticket_number: string; subject: string; priority: string; assigned_to: string | null; account: { company_name: string; assigned_rep_id: string | null } | null };
        const emails = await getStaffEmails(admin, [tk.assigned_to, tk.account?.assigned_rep_id]);
        const subject = `[${tk.priority.toUpperCase()}] Ticket ${tk.ticket_number}: ${tk.subject}`;
        const html = htmlWrap(
          subject,
          `<p>New ticket from <strong>${tk.account?.company_name ?? "—"}</strong>.</p><p><a href="https://xboomflow.com/tickets">Open in admin</a></p>`,
        );
        for (const e of emails) {
          const res = await sendEmail(e, subject, html);
          results.push({ channel: "email", to: e, ok: res.ok, error: res.error });
        }
        break;
      }

      case "ticket_message_added": {
        const ticketId = String(body.payload.ticket_id ?? "");
        const messageId = String(body.payload.message_id ?? "");
        const { data: t } = await admin
          .from("portal_tickets")
          .select("ticket_number, subject, account_id, assigned_to, raised_by_contact_id, account:portal_accounts(company_name, assigned_rep_id)")
          .eq("id", ticketId)
          .maybeSingle();
        const { data: m } = await admin
          .from("portal_ticket_messages")
          .select("body, sender_id, sender_name_snapshot, is_internal")
          .eq("id", messageId)
          .maybeSingle();
        if (!t || !m) return json({ error: "Ticket/message not found" }, 404);
        const tk = t as { ticket_number: string; subject: string; account_id: string; assigned_to: string | null; raised_by_contact_id: string | null; account: { company_name: string; assigned_rep_id: string | null } | null };
        const msg = m as { body: string; sender_id: string | null; sender_name_snapshot: string | null; is_internal: boolean };
        if (msg.is_internal) {
          // Internal-only — just notify staff, never the customer
          const emails = await getStaffEmails(admin, [tk.assigned_to, tk.account?.assigned_rep_id]);
          const subject = `[Internal] ${tk.ticket_number} ${tk.subject}`;
          const html = htmlWrap(subject, `<p>${msg.sender_name_snapshot ?? "Staff"}:</p><p style="white-space:pre-wrap">${msg.body}</p>`);
          for (const e of emails) {
            const res = await sendEmail(e, subject, html);
            results.push({ channel: "email", to: e, ok: res.ok, error: res.error });
          }
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
          const emails = await getStaffEmails(admin, [tk.assigned_to, tk.account?.assigned_rep_id]);
          const subject = `Reply on ${tk.ticket_number} — ${tk.subject}`;
          const html = htmlWrap(subject, `<p><strong>${msg.sender_name_snapshot ?? "Customer"}</strong> replied:</p><p style="background:#f3f4f6;padding:12px;border-radius:8px;white-space:pre-wrap">${msg.body}</p>`);
          for (const e of emails) {
            const res = await sendEmail(e, subject, html);
            results.push({ channel: "email", to: e, ok: res.ok, error: res.error });
          }
        } else {
          // notify customer contacts
          const contacts = await getAccountContacts(admin, tk.account_id);
          const prefs = await getPrefMap(admin, contacts.map((c) => c.id!).filter(Boolean), "ticket_replies");
          const subject = `Reply on ticket ${tk.ticket_number}`;
          const html = htmlWrap(
            subject,
            `<p>Our team responded on <strong>${tk.ticket_number}</strong>:</p><p style="background:#f3f4f6;padding:12px;border-radius:8px;white-space:pre-wrap">${msg.body}</p><p><a href="${PORTAL_BASE_URL}/tickets/${ticketId}">View ticket</a></p>`,
          );
          for (const c of contacts) {
            if (!c.email) continue;
            if (c.id && !prefs[c.id]?.email) continue;
            const res = await sendEmail(c.email, subject, html);
            results.push({ channel: "email", to: c.email, ok: res.ok, error: res.error });
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