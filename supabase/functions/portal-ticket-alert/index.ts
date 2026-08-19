// Staff-facing portal-ticket alerts: email + Slack DM.
//
// WHY THIS EXISTS
// portal-notify is invoked from the browser and requires an internal role, so
// every customer-raised event (`ticket_created`, customer replies) was
// rejected with 403 — portal contacts hold `b2b_customer`. No staff email had
// ever been sent for a customer-raised ticket.
//
// This function is instead called by pg_net from the database triggers in
// migration 20260818120000, so delivery no longer depends on who happened to
// write the row. In-app bell, snackbar toast and browser push already ride on
// the `notifications` INSERT those triggers perform; this covers the two
// channels that live outside the database.
//
// Auth: `x-cron-secret` must match the CRON_SECRET env var (same contract as
// send-push and portal-sla-monitor). Deployed with verify_jwt = false.
//
// Events:
//   ticket_created         payload: { ticket_id }
//   ticket_reply_to_staff  payload: { ticket_id, message_id }
//   ticket_assigned        payload: { ticket_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail as sendMailSeam } from "../_shared/email.ts";
import { resolveRecipients, type RoutingEvent } from "../_shared/staff-routing.ts";
import { sendSlackDmToEmail, sendSlackDmToUserId } from "../_shared/slack-dm.ts";
import { postSlackChannel } from "../_shared/slack-dm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const STAFF_BASE_URL = "https://xboomflow.com";
// #customer-portal-ticket. Every alert is posted here so the whole team sees
// the queue in one place; DMs continue on top so the people who must act still
// get a personal ping. Unset this secret to disable channel posting.
const TICKET_CHANNEL_ID = Deno.env.get("SLACK_TICKET_CHANNEL_ID") ?? "C0BR3CZ0KLL";

type Event = "ticket_created" | "ticket_reply_to_staff" | "ticket_assigned";

interface Body {
  event: Event;
  ticket_id: string;
  message_id?: string | null;
}

interface DeliveryResult {
  channel: "email" | "slack";
  to: string;
  ok: boolean;
  error?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Slack mrkdwn is picky about these three; everything else passes through. */
function slackEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(s: string, n: number): string {
  const t = (s ?? "").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function slackBlocks(opts: {
  heading: string;
  ticketNumber: string;
  subject: string;
  company: string;
  priority: string;
  ticketType: string | null;
  orderNumber: string | null;
  assigneeName: string | null;
  quote?: string | null;
  ticketUrl: string;
}) {
  const fields = [
    { type: "mrkdwn", text: `*Ticket:*\n\`${slackEscape(opts.ticketNumber)}\`` },
    { type: "mrkdwn", text: `*Customer:*\n${slackEscape(opts.company)}` },
    { type: "mrkdwn", text: `*Priority:*\n${slackEscape(opts.priority || "normal")}` },
    {
      type: "mrkdwn",
      text: `*Owner:*\n${opts.assigneeName ? slackEscape(opts.assigneeName) : "_Unassigned_"}`,
    },
  ];
  if (opts.orderNumber) {
    fields.push({ type: "mrkdwn", text: `*Order:*\n\`${slackEscape(opts.orderNumber)}\`` });
  }
  if (opts.ticketType === "service_request") {
    fields.push({ type: "mrkdwn", text: `*Type:*\nService request · 12h SLA` });
  }

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: opts.heading, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${slackEscape(truncate(opts.subject, 150))}*` },
    },
    { type: "section", fields },
  ];

  if (opts.quote) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `>${slackEscape(truncate(opts.quote, 400)).replace(/\n/g, "\n>")}` },
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Open ticket", emoji: true },
        url: opts.ticketUrl,
        style: "primary",
      },
    ],
  });

  return blocks;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "Forbidden" }, 403);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body?.event || !body?.ticket_id) {
    return json({ error: "event and ticket_id required" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: t } = await admin
    .from("portal_tickets")
    .select(
      "id, ticket_number, subject, priority, ticket_type, assigned_to, account_id, " +
        "related_order_id, related_order_number, " +
        "account:portal_accounts(company_name, assigned_rep_id)",
    )
    .eq("id", body.ticket_id)
    .maybeSingle();
  if (!t) return json({ error: "Ticket not found" }, 404);

  const tk = t as unknown as {
    id: string;
    ticket_number: string;
    subject: string;
    priority: string;
    ticket_type: string | null;
    assigned_to: string | null;
    account_id: string;
    related_order_id: string | null;
    related_order_number: string | null;
    account: { company_name: string | null; assigned_rep_id: string | null } | null;
  };

  // The order's salesperson is a recipient in their own right — a ticket about
  // their order should not reach them only because they happen to be the
  // account rep.
  let salesOwner: string | null = null;
  if (tk.related_order_id) {
    const { data: o } = await admin
      .from("orders")
      .select("sales_person_id")
      .eq("id", tk.related_order_id)
      .maybeSingle();
    salesOwner = (o as { sales_person_id: string | null } | null)?.sales_person_id ?? null;
  }

  let quote: string | null = null;
  let senderName = "Customer";
  if (body.event === "ticket_reply_to_staff" && body.message_id) {
    const { data: m } = await admin
      .from("portal_ticket_messages")
      .select("body, sender_name_snapshot, is_internal")
      .eq("id", body.message_id)
      .maybeSingle();
    const msg = m as
      | { body: string; sender_name_snapshot: string | null; is_internal: boolean }
      | null;
    if (!msg) return json({ error: "Message not found" }, 404);
    if (msg.is_internal) return json({ skipped: "internal note" });
    quote = msg.body ?? "";
    senderName = msg.sender_name_snapshot ?? "Customer";
  }

  const routingEvent: RoutingEvent = body.event;
  const { userIds, recipients, reasons } = await resolveRecipients(admin, routingEvent, {
    assignee: tk.assigned_to,
    accountRep: tk.account?.assigned_rep_id ?? null,
    salesOwner,
    ticketType: tk.ticket_type,
  });
  console.log(
    `[portal-ticket-alert] ${body.event} ${tk.ticket_number} ` +
      `recipients=${userIds.length} reasons=${reasons.join(",")}`,
  );
  if (userIds.length === 0) {
    return json({ ok: true, skipped: "no recipients", ticket: tk.ticket_number });
  }

  // Profile lookup serves two purposes: the Slack member id (preferred DM
  // target) and the assignee's display name for the message body.
  // profiles.user_id is the auth uid — profiles.id is the row's own uuid.
  const profileIds = [...new Set([...userIds, tk.assigned_to].filter((v): v is string => !!v))];
  const { data: profs } = await admin
    .from("profiles")
    .select("user_id, name, email, slack_user_id")
    .in("user_id", profileIds);
  const profileByUser = new Map(
    ((profs ?? []) as Array<{
      user_id: string;
      name: string | null;
      email: string | null;
      slack_user_id: string | null;
    }>).map((p) => [p.user_id, p]),
  );

  const company = tk.account?.company_name ?? "Portal customer";
  const ticketUrl = `${STAFF_BASE_URL}/admin/portal-tickets/${tk.id}`;
  const assigneeName = tk.assigned_to
    ? (profileByUser.get(tk.assigned_to)?.name ?? profileByUser.get(tk.assigned_to)?.email ?? null)
    : null;

  const heading = body.event === "ticket_created"
    ? (tk.ticket_type === "service_request"
        ? `🔧 New service request — ${tk.ticket_number}`
        : `🎫 New customer ticket — ${tk.ticket_number}`)
    : body.event === "ticket_reply_to_staff"
      ? `💬 Customer replied — ${tk.ticket_number}`
      : `📌 Ticket assigned to you — ${tk.ticket_number}`;

  const results: DeliveryResult[] = [];

  // ---- Email --------------------------------------------------------------
  const emails = recipients.map((r) => r.email).filter((e): e is string => !!e);
  if (emails.length > 0) {
    const { templateName, templateData, idempotencyKey } = body.event === "ticket_created"
      ? {
        templateName: "portal-ticket-created",
        templateData: {
          ticket_number: tk.ticket_number,
          subject: tk.subject,
          priority: tk.priority,
          company_name: company,
          ticket_url: ticketUrl,
        },
        idempotencyKey: `portal-ticket-alert:ticket_created:${tk.id}`,
      }
      : body.event === "ticket_reply_to_staff"
      ? {
        templateName: "portal-ticket-reply-to-staff",
        templateData: {
          ticket_number: tk.ticket_number,
          subject: tk.subject,
          sender_name: senderName,
          body: quote ?? "",
          ticket_url: ticketUrl,
        },
        idempotencyKey: `portal-ticket-alert:reply:${body.message_id}`,
      }
      : {
        templateName: "portal-ticket-assigned",
        templateData: {
          ticket_number: tk.ticket_number,
          subject: tk.subject,
          priority: tk.priority,
          company_name: company,
          assignee_name: assigneeName ?? "",
          order_number: tk.related_order_number ?? "",
          ticket_url: ticketUrl,
        },
        idempotencyKey: `portal-ticket-alert:assigned:${tk.id}:${tk.assigned_to}`,
      };

    const r = await sendMailSeam({
      provider: "platform",
      to: emails,
      subject: "",
      html: "",
      templateName,
      templateData,
      idempotencyKey,
    });
    for (const e of emails) {
      results.push({ channel: "email", to: e, ok: r.ok, error: r.ok ? undefined : r.error });
    }
  }

  // ---- Slack --------------------------------------------------------------
  // Channel post so the whole team sees the queue in one place, plus DMs so
  // the people who must act get a personal ping. The channel post is sent
  // first: if the DM fan-out fails, the alert is still visible somewhere.
  const blocks = slackBlocks({
    heading,
    ticketNumber: tk.ticket_number,
    subject: tk.subject,
    company,
    priority: tk.priority,
    ticketType: tk.ticket_type,
    orderNumber: tk.related_order_number,
    assigneeName,
    quote,
    ticketUrl,
  });
  const fallbackText = `${heading} — ${truncate(tk.subject, 120)} (${company})`;

  if (TICKET_CHANNEL_ID) {
    const res = await postSlackChannel(TICKET_CHANNEL_ID, fallbackText, blocks);
    results.push({
      channel: "slack",
      to: `#${TICKET_CHANNEL_ID}`,
      ok: res.ok,
      error: res.ok ? undefined : res.error,
    });
  }

  await Promise.all(recipients.map(async (rcpt) => {
    const prof = profileByUser.get(rcpt.userId);
    const slackId = prof?.slack_user_id ?? null;
    const slackEmail = rcpt.email ?? prof?.email ?? null;

    let res;
    if (slackId) {
      res = await sendSlackDmToUserId(slackId, fallbackText, blocks);
    } else if (slackEmail) {
      res = await sendSlackDmToEmail(slackEmail, fallbackText, blocks);
    } else {
      res = { ok: false, error: "no slack id and no email on file" };
    }
    results.push({
      channel: "slack",
      to: slackId ?? slackEmail ?? rcpt.userId,
      ok: res.ok,
      error: res.ok ? undefined : res.error,
    });
  }));

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.warn(
      `[portal-ticket-alert] ${failed.length}/${results.length} deliveries failed: ` +
        failed.map((f) => `${f.channel}:${f.to}:${f.error}`).join(" | "),
    );
  }

  return json({
    ok: true,
    event: body.event,
    ticket: tk.ticket_number,
    recipients: userIds.length,
    delivered: results.filter((r) => r.ok).length,
    failed: failed.length,
    results,
  });
});
