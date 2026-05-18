import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const ADMIN_EMAILS = ["vishal.saurav@xboom.in", "nishant.k@xboom.in"];
const FROM_EMAIL = "Xboom Sync Monitor <support@xboom.in>";

// source key -> { table, dateColumn, label, staleHours }
// staleHours: how long without a new record before we consider the source unhealthy
interface SourceCheck {
  key: string;
  label: string;
  table: string;
  dateColumn: string;
  staleHours: number;
  filterColumn?: string;
  filterValue?: string;
}

const SOURCES: SourceCheck[] = [
  { key: "interakt", label: "Interakt", table: "interakt_leads", dateColumn: "interakt_created_at", staleHours: 24 },
  { key: "google_ads", label: "Google Ads", table: "google_ads_leads", dateColumn: "created_at", staleHours: 48 },
  { key: "woocommerce", label: "WooCommerce (Xboom Website)", table: "woocommerce_orders", dateColumn: "woo_created_at", staleHours: 12 },
  { key: "shopify", label: "Shopify", table: "shopify_orders", dateColumn: "shopify_created_at", staleHours: 24 },
  { key: "email_leads", label: "Email Leads (Gmail)", table: "email_leads", dateColumn: "ingested_at", staleHours: 24 },
  { key: "elevenlabs", label: "ElevenLabs (Voice AI)", table: "call_logs", dateColumn: "created_at", staleHours: 48, filterColumn: "lead_source", filterValue: "ElevenLabs" },
  { key: "myoperator", label: "MyOperator (Call Logs)", table: "call_logs", dateColumn: "created_at", staleHours: 6, filterColumn: "raw_payload", filterValue: "__not_null__" },
  { key: "qforms", label: "QForms (Website Forms)", table: "leads", dateColumn: "created_at", staleHours: 24, filterColumn: "form_type", filterValue: "__not_null__" },
];

interface HealthRow {
  source: string;
  label: string;
  last_record_at: string | null;
  hours_since: number | null;
  threshold_hours: number;
  is_stale: boolean;
  total_records: number;
}

async function fetchHealth(supabase: any): Promise<HealthRow[]> {
  const out: HealthRow[] = [];
  for (const s of SOURCES) {
    try {
      let latestQ = supabase
        .from(s.table)
        .select(`${s.dateColumn}`)
        .not(s.dateColumn, "is", null);
      if (s.filterColumn && s.filterValue) {
        if (s.filterValue === "__not_null__") latestQ = latestQ.not(s.filterColumn, "is", null);
        else latestQ = latestQ.eq(s.filterColumn, s.filterValue);
      }
      const { data: latest } = await latestQ
        .order(s.dateColumn, { ascending: false })
        .limit(1)
        .maybeSingle();
      let countQ = supabase
        .from(s.table)
        .select("*", { count: "exact", head: true });
      if (s.filterColumn && s.filterValue) {
        if (s.filterValue === "__not_null__") countQ = countQ.not(s.filterColumn, "is", null);
        else countQ = countQ.eq(s.filterColumn, s.filterValue);
      }
      const { count } = await countQ;
      const lastAt = latest?.[s.dateColumn] || null;
      const hoursSince = lastAt
        ? (Date.now() - new Date(lastAt).getTime()) / (1000 * 60 * 60)
        : null;
      out.push({
        source: s.key,
        label: s.label,
        last_record_at: lastAt,
        hours_since: hoursSince,
        threshold_hours: s.staleHours,
        is_stale: hoursSince === null || hoursSince > s.staleHours,
        total_records: count || 0,
      });
    } catch (e) {
      console.error(`health check error for ${s.key}:`, (e as Error).message);
      out.push({
        source: s.key,
        label: s.label,
        last_record_at: null,
        hours_since: null,
        threshold_hours: s.staleHours,
        is_stale: true,
        total_records: 0,
      });
    }
  }
  return out;
}

function buildEmailHtml(stale: HealthRow[], healthy: HealthRow[]): string {
  const row = (r: HealthRow, color: string) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;color:${color};">${r.label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${r.last_record_at ? new Date(r.last_record_at).toUTCString() : "Never"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${r.hours_since === null ? "—" : r.hours_since.toFixed(1) + " h"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${r.threshold_hours} h</td>
    </tr>`;
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f7f7f9;padding:24px;">
    <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;border:1px solid #e5e7eb;">
      <h2 style="margin:0 0 8px;color:#dc2626;">⚠️ Lead Sync Alert</h2>
      <p style="color:#374151;margin:0 0 16px;">${stale.length} lead source${stale.length === 1 ? " has" : "s have"} stopped syncing. Please investigate immediately.</p>
      <h3 style="color:#dc2626;margin:20px 0 8px;">Stale Sources</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#fef2f2;">
          <th align="left" style="padding:8px 12px;">Source</th>
          <th align="left" style="padding:8px 12px;">Last Record</th>
          <th align="left" style="padding:8px 12px;">Idle</th>
          <th align="left" style="padding:8px 12px;">Threshold</th>
        </tr></thead>
        <tbody>${stale.map((r) => row(r, "#dc2626")).join("")}</tbody>
      </table>
      ${healthy.length > 0 ? `
      <h3 style="color:#16a34a;margin:24px 0 8px;">Healthy Sources</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#f0fdf4;">
          <th align="left" style="padding:8px 12px;">Source</th>
          <th align="left" style="padding:8px 12px;">Last Record</th>
          <th align="left" style="padding:8px 12px;">Idle</th>
          <th align="left" style="padding:8px 12px;">Threshold</th>
        </tr></thead>
        <tbody>${healthy.map((r) => row(r, "#16a34a")).join("")}</tbody>
      </table>` : ""}
      <p style="color:#6b7280;font-size:12px;margin-top:24px;">Generated at ${new Date().toUTCString()} by Xboom Sync Monitor.</p>
    </div>
  </body></html>`;
}

async function sendAlertEmail(stale: HealthRow[], healthy: HealthRow[]) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("RESEND_API_KEY not configured");
    return { sent: false, error: "missing_api_key" };
  }
  const subject = `🚨 [Xboom] ${stale.length} lead source${stale.length === 1 ? "" : "s"} not syncing`;
  const html = buildEmailHtml(stale, healthy);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: ADMIN_EMAILS, subject, html }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error("Resend error:", res.status, body);
    return { sent: false, error: body };
  }
  return { sent: true, response: body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: cron-secret OR JWT (admin)
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  const isCron = cronSecret && expectedSecret && cronSecret === expectedSecret;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (!isCron) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const health = await fetchHealth(supabase);
    const stale = health.filter((r) => r.is_stale);
    const healthy = health.filter((r) => !r.is_stale);

    let emailResult: any = { sent: false, reason: "no_stale_sources" };
    const sendAlert = isCron || new URL(req.url).searchParams.get("alert") === "1";
    if (stale.length > 0 && sendAlert) {
      emailResult = await sendAlertEmail(stale, healthy);
    }

    // Log run
    await supabase.from("sync_health_runs").insert({
      stale_count: stale.length,
      healthy_count: healthy.length,
      details: health,
      email_sent: emailResult.sent || false,
      triggered_by: isCron ? "cron" : "manual",
    }).then(() => null, (e) => console.error("log insert failed:", e?.message));

    return new Response(
      JSON.stringify({ success: true, health, stale_count: stale.length, email: emailResult }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-health-check error:", (e as Error).message);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});