// kyc-reminders — daily cron. Sends soft reminder emails at 24h, 3d, 7d after
// the customer's first order if KYC has not been approved. Idempotent per
// reminder type via kyc_audit_log lookup.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail as sendMailSeam } from "../_shared/email.ts";

const PORTAL_BASE = "https://xboomflow.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function esc(s: string) {
  return (s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

async function sendEmail(to: string, subject: string, html: string) {
  const r = await sendMailSeam({ to, subject, html });
  return r.ok;
}

function reminderHtml(name: string, daysOld: number) {
  const link = `${PORTAL_BASE}/portal/kyc`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08);">
        <tr><td style="background:#0c1e3e;padding:22px 28px;color:#fff;font-weight:700;">x<span style="color:#d4af37;">boom</span> <span style="font-size:11px;letter-spacing:1.5px;opacity:.7;margin-left:8px;text-transform:uppercase;">KYC reminder</span></td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 10px;font-size:20px;">Quick reminder — your KYC isn't finished yet</h1>
          <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.55;">Hi ${esc(name)}, it's been ${daysOld} day${daysOld === 1 ? "" : "s"} since your order. We still need your Aadhaar card to keep things moving smoothly.</p>
          <p style="margin:0 0 0;"><a href="${link}" style="display:inline-block;background:#0c1e3e;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px;">Upload KYC now</a></p>
        </td></tr>
      </table>
    </td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Find accounts whose first onboarding email was sent N days ago and KYC not yet approved
  const now = Date.now();
  const buckets = [
    { days: 1, label: "24h" },
    { days: 3, label: "3d" },
    { days: 7, label: "7d" },
  ];

  let sent = 0;
  for (const b of buckets) {
    const sinceMs = now - b.days * 24 * 60 * 60 * 1000;
    const windowStart = new Date(sinceMs - 12 * 60 * 60 * 1000).toISOString();
    const windowEnd = new Date(sinceMs + 12 * 60 * 60 * 1000).toISOString();

    // Find onboarding events in this window
    const { data: events } = await admin
      .from("kyc_audit_log")
      .select("account_id, created_at")
      .eq("action", "onboarding_email_sent")
      .gte("created_at", windowStart)
      .lte("created_at", windowEnd);

    for (const ev of events || []) {
      const accountId = (ev as any).account_id as string;
      // Skip if already approved
      const { data: acct } = await admin
        .from("portal_accounts")
        .select("kyc_status, company_name, primary_contact_name")
        .eq("id", accountId)
        .maybeSingle();
      if (!acct || acct.kyc_status === "approved") continue;

      // Idempotency: have we already sent this bucket?
      const { data: already } = await admin
        .from("kyc_audit_log")
        .select("id")
        .eq("account_id", accountId)
        .eq("action", `reminder_${b.label}`)
        .limit(1);
      if (already && already.length > 0) continue;

      const { data: contact } = await admin
        .from("portal_contacts")
        .select("email, full_name")
        .eq("account_id", accountId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!contact?.email) continue;

      const ok = await sendEmail(
        contact.email,
        `Reminder: upload your Aadhaar to complete KYC`,
        reminderHtml(contact.full_name || acct.primary_contact_name || "there", b.days),
      );
      if (ok) sent++;

      await admin.from("kyc_audit_log").insert({
        account_id: accountId,
        action: `reminder_${b.label}`,
        actor_role: "system",
        notes: ok ? null : "send failed",
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});