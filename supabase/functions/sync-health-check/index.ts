import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const ADMIN_EMAILS = ["vishal.saurav@xboom.in", "nishant.k@xboom.in"];

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
  // Measure ElevenLabs liveness at the webhook boundary. Most conversations
  // are web-widget chats with no phone leg, so they never produce a
  // call_logs row (no caller_id). call_webhook_logs captures every
  // ElevenLabs webhook we receive — the honest "is it alive" signal.
  { key: "elevenlabs", label: "ElevenLabs (Voice AI)", table: "call_webhook_logs", dateColumn: "created_at", staleHours: 48, filterColumn: "source", filterValue: "elevenlabs" },
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

async function sendAlertEmail(stale: HealthRow[], healthy: HealthRow[]) {
  const { sendEmail: sendMailSeam } = await import("../_shared/email.ts");
  // Stable idempotency: one alert per hourly bucket per stale set. Retries
  // of the same cron minute collapse; a new hour or a change in the stale
  // source list produces a fresh key.
  const bucket = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const staleSig = stale.map((r) => r.source).sort().join(",");
  const idempotencyKey = `sync-health-alert:${bucket}:${staleSig}`.slice(0, 240);
  const res = await sendMailSeam({
    provider: "platform",
    to: ADMIN_EMAILS,
    subject: "",
    html: "",
    templateName: "sync-health-alert",
    templateData: {
      stale,
      healthy,
      generated_at: new Date().toUTCString(),
    },
    idempotencyKey,
  });
  if (!res.ok) {
    console.error("Email error:", res.status, res.error);
    return { sent: false, error: res.error };
  }
  return { sent: true, response: res.raw };
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
    // Require internal staff role — mirrors the pattern used by
    // other cron-style endpoints. Portal customers authenticate against
    // the same project and must not be able to read internal sync health.
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .in("role", ["admin", "supply_chain"]);
    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
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