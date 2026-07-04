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

// Migrated to platform (queued React Email template `kyc-reminder`).
async function sendReminder(to: string, name: string, daysOld: number, accountId: string, bucket: string): Promise<boolean> {
  const r = await sendMailSeam({
    to,
    subject: "",
    html: "",
    provider: "platform",
    templateName: "kyc-reminder",
    templateData: {
      name,
      daysOld,
      kycLink: `${PORTAL_BASE}/portal/kyc`,
    },
    // Idempotency key mirrors the kyc_audit_log identity — one row per
    // (account, reminder bucket) — so retries never double-send.
    idempotencyKey: `kyc:reminder:${accountId}:${bucket}`,
  });
  return r.ok;
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

      const ok = await sendReminder(
        contact.email,
        contact.full_name || acct.primary_contact_name || "there",
        b.days,
        accountId,
        b.label,
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