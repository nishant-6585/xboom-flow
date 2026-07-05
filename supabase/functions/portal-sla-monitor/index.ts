// Portal SLA monitor — runs every 30 min via pg_cron.
// Detects tickets that have breached either the first-response or resolution SLA
// and (a) records a row in `portal_sla_alerts` to avoid duplicate notifications,
// (b) emails the assigned rep + portal admins, (c) escalates priority to "high"
// for first-response breaches and "critical" for resolution breaches.
//
// Auth: requires header `X-Cron-Secret` matching the `CRON_SECRET` env var.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail as sendMailSeam } from "../_shared/email.ts";

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

    // Resolve recipient emails (assigned_to + account rep + any admin)
    const userIds = [row.assigned_to, row.account?.assigned_rep_id].filter(
      (x): x is string => !!x,
    );
    const { data: adminRoles } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    for (const r of (adminRoles ?? []) as Array<{ user_id: string }>) userIds.push(r.user_id);

    // Service requests: also loop in supply_chain + sales_manager
    if (row.ticket_type === "service_request") {
      const { data: extras } = await admin
        .from("user_roles")
        .select("user_id")
        .in("role", ["supply_chain", "sales_manager"]);
      for (const r of (extras ?? []) as Array<{ user_id: string }>) userIds.push(r.user_id);

      // In-app notifications (never block on email)
      const label = kind === "first_response" ? "First response" : "Resolution";
      for (const uid of [...new Set(userIds)]) {
        try {
          await admin.from("notifications").insert({
            user_id: uid,
            type: "portal_service_request_sla",
            title: `[SLA breach] ${label} — ${row.ticket_number}`,
            message: `${row.subject} (${row.account?.company_name ?? "—"})`,
          });
        } catch { /* ignore */ }
      }
    }

    const emails: string[] = [];
    for (const uid of [...new Set(userIds)]) {
      try {
        const { data } = await admin.auth.admin.getUserById(uid);
        if (data?.user?.email) emails.push(data.user.email);
      } catch { /* ignore */ }
    }

    const label = kind === "first_response" ? "First-response SLA breached" : "Resolution SLA breached";
    const uniqueRecipients = [...new Set(emails)];
    if (uniqueRecipients.length > 0) {
      await sendBreachAlert({
        ticketId: row.id,
        kind,
        label,
        ticketNumber: row.ticket_number,
        subject: row.subject,
        accountName: row.account?.company_name ?? "—",
        priority: row.priority,
        recipients: uniqueRecipients,
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