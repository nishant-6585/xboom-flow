// Portal SLA monitor — runs every 30 min via pg_cron.
// Detects tickets that have breached either the first-response or resolution SLA
// and (a) records a row in `portal_sla_alerts` to avoid duplicate notifications,
// (b) emails the assigned rep + portal admins, (c) escalates priority to "high"
// for first-response breaches and "critical" for resolution breaches.
//
// Auth: requires header `X-Cron-Secret` matching the `CRON_SECRET` env var.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail as sendMailSeam } from "../_shared/email.ts";
import { resolveRecipients } from "../_shared/staff-routing.ts";
import { sendSlackDmToEmail, sendSlackDmToUserId, postSlackChannel } from "../_shared/slack-dm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};


function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendBreachAlert(opts: {
  ticketId: string;
  kind: "first_response" | "resolution";
  label: string;
  ticketNumber: string;
  subject: string;
  accountName: string;
  priority: string;
  recipients: string[];
}) {
  const ticketUrl = `https://xboomflow.com/admin/portal-tickets/${opts.ticketId}`;
  // Stable idempotency: one alert per (ticket, breach kind). The
  // portal_sla_alerts guard prevents re-sends across runs; this key
  // additionally collapses in-flight retries.
  const idempotencyKey = `portal-sla-alert:${opts.ticketId}:${opts.kind}`;
  const r = await sendMailSeam({
    provider: "platform",
    to: opts.recipients,
    subject: "",
    html: "",
    templateName: "portal-sla-alert",
    templateData: {
      label: opts.label,
      ticket_number: opts.ticketNumber,
      subject: opts.subject,
      account_name: opts.accountName,
      priority: opts.priority,
      ticket_url: ticketUrl,
    },
    idempotencyKey,
  });
  return { ok: r.ok, error: r.error };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!cronSecret || provided !== cronSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date().toISOString();
  const breached: Array<{ ticket_id: string; breach_type: "first_response" | "resolution" }> = [];

  // 1) First-response breaches: open tickets, no first_response_at, due passed
  const { data: frBreaches } = await admin
    .from("portal_tickets")
    .select("id, ticket_number, subject, priority, ticket_type, account_id, assigned_to, sla_first_response_due_at, account:portal_accounts(company_name, assigned_rep_id)")
    .is("first_response_at", null)
    .lt("sla_first_response_due_at", now)
    .not("status", "in", "(resolved,closed)")
    .limit(200);

  // 2) Resolution breaches: not resolved, due passed
  const { data: resBreaches } = await admin
    .from("portal_tickets")
    .select("id, ticket_number, subject, priority, ticket_type, account_id, assigned_to, sla_resolution_due_at, account:portal_accounts(company_name, assigned_rep_id)")
    .is("resolved_at", null)
    .lt("sla_resolution_due_at", now)
    .not("status", "in", "(resolved,closed)")
    .limit(200);

  type Row = {
    id: string;
    ticket_number: string;
    subject: string;
    priority: string;
    ticket_type: string;
    assigned_to: string | null;
    account: { company_name: string; assigned_rep_id: string | null } | null;
  };

  const sendBreachEmail = async (row: Row, kind: "first_response" | "resolution") => {
    // Already alerted?
    const { data: existing } = await admin
      .from("portal_sla_alerts")
      .select("id")
      .eq("ticket_id", row.id)
      .eq("breach_type", kind)
      .maybeSingle();
    if (existing) return;

    // Resolve recipients via the shared routing table. Owner-first
    // (assignee, else account rep); service_request adds supply_chain;
    // resolution breaches escalate to sales_manager. Admins are NEVER
    // added here — admin visibility stays via in-app notifications.
    const { userIds, emails, reasons } = await resolveRecipients(
      admin,
      kind === "first_response" ? "first_response_breach" : "resolution_breach",
      {
        assignee: row.assigned_to,
        accountRep: row.account?.assigned_rep_id ?? null,
        ticketType: row.ticket_type,
      },
    );

    const shortLabel = kind === "first_response" ? "First response" : "Resolution";
    const ticketUrl = `https://xboomflow.com/admin/portal-tickets/${row.id}`;

    // In-app notification for EVERY breached ticket, not just service
    // requests. portal_ticket_id makes the bell entry and the toast navigate
    // straight to the thread; the portal_sla_breach type is what the client
    // toasts on (see useNotifications).
    for (const uid of userIds) {
      try {
        await admin.from("notifications").insert({
          user_id: uid,
          type: "portal_sla_breach",
          title: `[SLA breach] ${shortLabel} — ${row.ticket_number}`,
          message: `${row.subject} (${row.account?.company_name ?? "—"})`,
          portal_ticket_id: row.id,
          metadata: {
            ticket_number: row.ticket_number,
            breach_type: kind,
            priority: row.priority,
            ticket_type: row.ticket_type,
            unassigned: row.assigned_to === null,
          },
        });
      } catch { /* in-app is best-effort; email/Slack still go out */ }
    }
    console.log(`[sla-monitor] ${row.ticket_number} ${kind} recipients=${emails.length} reasons=${reasons.join(",")}`);

    // Slack DM to the same people. Prefer the stored Slack member id and fall
    // back to a users.lookupByEmail on the app login address.
    try {
      // Breaches go to the shared channel too — an unactioned SLA is exactly
      // what the whole team should be able to see without opening a DM.
      const channelId = Deno.env.get("SLACK_TICKET_CHANNEL_ID") ?? "C0BR3CZ0KLL";
      const { data: profs } = await admin
        .from("profiles")
        .select("user_id, email, slack_user_id")
        .in("user_id", userIds);
      const slackText =
        `🚨 ${shortLabel} SLA breached — ${row.ticket_number}: ${row.subject} ` +
        `(${row.account?.company_name ?? "—"})${row.assigned_to ? "" : " · UNASSIGNED"}\n${ticketUrl}`;
      if (channelId) await postSlackChannel(channelId, slackText);
      await Promise.all(
        ((profs ?? []) as Array<{ user_id: string; email: string | null; slack_user_id: string | null }>)
          .map((pr) =>
            pr.slack_user_id
              ? sendSlackDmToUserId(pr.slack_user_id, slackText)
              : pr.email
              ? sendSlackDmToEmail(pr.email, slackText)
              : Promise.resolve({ ok: false, error: "no slack target" })
          ),
      );
    } catch (e) {
      console.warn("[sla-monitor] slack fan-out failed:", e instanceof Error ? e.message : e);
    }

    const label = kind === "first_response" ? "First-response SLA breached" : "Resolution SLA breached";
    if (emails.length > 0) {
      await sendBreachAlert({
        ticketId: row.id,
        kind,
        label,
        ticketNumber: row.ticket_number,
        subject: row.subject,
        accountName: row.account?.company_name ?? "—",
        priority: row.priority,
        recipients: emails,
      });
    }

    await admin.from("portal_sla_alerts").insert({ ticket_id: row.id, breach_type: kind });

    // Auto-escalate priority
    const newPriority = kind === "resolution" ? "critical" : (row.priority === "low" || row.priority === "normal" ? "high" : row.priority);
    if (newPriority !== row.priority) {
      await admin.from("portal_tickets").update({ priority: newPriority }).eq("id", row.id);
    }

    breached.push({ ticket_id: row.id, breach_type: kind });
  };

  for (const row of (frBreaches ?? []) as unknown as Row[]) {
    await sendBreachEmail(row, "first_response");
  }
  for (const row of (resBreaches ?? []) as unknown as Row[]) {
    await sendBreachEmail(row, "resolution");
  }

  return json({ ok: true, breached_count: breached.length, breached });
});