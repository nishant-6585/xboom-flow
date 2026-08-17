// Daily "Lead → Prospect → Pipeline" funnel report.
// Posts to Slack and sends a WhatsApp template message to the admin trio
// (Vishal, Nishant, Amit). Scheduled by pg_cron at 2 PM and 7 PM IST.
//
// Auth: X-Cron-Secret (vault-backed) or an admin / sales_manager JWT.
import { createClient } from "npm:@supabase/supabase-js@2";
import { isAuthorizedCron } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const IST_OFFSET = 5.5 * 60 * 60 * 1000;

// WhatsApp recipients — admins only.
const WA_RECIPIENTS = [
  { name: "Vishal", phone: "7795067437" },
  { name: "Nishant", phone: "8050727713" },
  { name: "Amit", phone: "7004466254" },
];
const WA_TEMPLATE = Deno.env.get("FUNNEL_REPORT_WA_TEMPLATE") || "daily_funnel_report_v1";

function istLabels() {
  const now = new Date();
  const ist = new Date(now.getTime() + IST_OFFSET);
  return {
    day: ist.toISOString().slice(0, 10),
    time: `${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")} IST`,
  };
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);

function inr(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  if (v >= 1e3) return `₹${Math.round(v / 1e3)}K`;
  return `₹${Math.round(v)}`;
}

async function sendSlack(
  botToken: string | null,
  webhookUrl: string | null,
  channel: string | null,
  blocks: unknown[],
  text: string,
) {
  if (botToken && channel) {
    const r = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel, blocks, text }),
    });
    const j = await r.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (j?.ok) return { ok: true };
    console.error("slack chat.postMessage failed:", j?.error);
    if (!webhookUrl) return { ok: false, error: j?.error || `http ${r.status}` };
  }
  if (webhookUrl) {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks, text }),
    });
    if (!r.ok) return { ok: false, error: `webhook http ${r.status}` };
    return { ok: true };
  }
  return { ok: false, error: "no slack destination configured" };
}

/** Interakt WABA template send. bodyValues order must match the approved template. */
async function sendWhatsApp(phone: string, bodyValues: string[]) {
  const apiKey = Deno.env.get("INTERAKT_API_KEY");
  if (!apiKey) return { ok: false, error: "INTERAKT_API_KEY not configured" };

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return { ok: false, error: `invalid phone ${phone}` };
  const countryCode = digits.length === 10 ? "91" : digits.slice(0, digits.length - 10);
  const phoneNumber = digits.slice(-10);

  try {
    const r = await fetch("https://api.interakt.ai/v1/public/message/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${apiKey}` },
      body: JSON.stringify({
        countryCode,
        phoneNumber,
        callbackData: `funnel_report_${Date.now()}`,
        type: "Template",
        template: { name: WA_TEMPLATE, languageCode: "en", bodyValues },
      }),
    });
    const text = await r.text();
    let j: any;
    try { j = JSON.parse(text); } catch { j = { raw: text.slice(0, 300) }; }
    if (!r.ok || j?.result === false) {
      return { ok: false, error: `Interakt ${r.status}: ${j?.message || j?.error || "send failed"}` };
    }
    console.log(`[whatsapp] ${phoneNumber} accepted:`, JSON.stringify(j).slice(0, 400));
    return { ok: true, status: r.status, response: j };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "interakt request failed" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    let isAuthorized = await isAuthorizedCron(req);
    const authHeader = req.headers.get("Authorization");
    if (!isAuthorized && authHeader?.startsWith("Bearer ")) {
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user?.id) {
        const admin = createClient(supabaseUrl, serviceKey);
        const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
        if (roles?.some((r: { role: string }) => r.role === "admin" || r.role === "sales_manager")) {
          isAuthorized = true;
        }
      }
    }
    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let force = false;
    try { force = (await req.json())?.force === true; } catch { /* no body */ }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: settings } = await supabase.from("slack_settings").select("*").limit(1).maybeSingle();
    const s = (settings ?? {}) as Record<string, unknown>;

    const slackOn = Boolean(s.is_enabled) && (force || Boolean(s.enable_prospect_pipeline_report));
    const channel = (s.channel_prospect_pipeline as string | null)
      || (s.channel_sales_report as string | null) || null;

    const { day, time } = istLabels();

    const { data: metrics, error: mErr } = await supabase.rpc("get_sales_dashboard_metrics", {
      p_start: day,
      p_end: day,
      p_sales_person_id: null,
      p_include_website: false,
    });
    if (mErr) throw mErr;

    const t = ((metrics ?? {}) as any).totals ?? {};
    const leads = num(t.total_leads);
    const prospects = num(t.total_prospects);
    const pipeline = num(t.pipeline_count);
    const pipelineValue = num(t.pipeline_value);
    const won = num(t.orders_won);
    const revenue = num(t.revenue);
    const l2p = num(t.lead_to_prospect);
    const p2pl = num(t.prospect_to_pipeline);
    const pl2w = num(t.pipeline_to_won);

    const summary =
      `Funnel ${day} — Leads ${leads} → Prospects ${prospects} → Pipeline ${pipeline} (${inr(pipelineValue)}) → Won ${won} (${inr(revenue)})`;

    const blocks: unknown[] = [
      { type: "header", text: { type: "plain_text", text: "📊 Lead → Prospect → Pipeline Funnel", emoji: true } },
      { type: "context", elements: [{ type: "mrkdwn", text: `📅 ${day} • 🕒 as of ${time}` }] },
      { type: "divider" },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Total Leads*\n${leads}` },
          { type: "mrkdwn", text: `*Prospects*\n${prospects}` },
          { type: "mrkdwn", text: `*Pipeline*\n${pipeline} • ${inr(pipelineValue)}` },
          { type: "mrkdwn", text: `*Orders Won*\n${won} • ${inr(revenue)}` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Conversion*\nLead → Prospect *${l2p}%* • Prospect → Pipeline *${p2pl}%* • Pipeline → Won *${pl2w}%*`,
        },
      },
      { type: "context", elements: [{ type: "mrkdwn", text: "XBoom Flow • automated funnel report" }] },
    ];

    const slack = slackOn
      ? await sendSlack(
          Deno.env.get("SLACK_BOT_TOKEN") || null,
          Deno.env.get("SLACK_WEBHOOK_URL") || null,
          channel, blocks, summary,
        )
      : { ok: false, error: "slack reporting disabled" };

    // WhatsApp — admins only. bodyValues order must match the approved template.
    const bodyValues = [
      `${day} ${time}`,
      String(leads),
      String(prospects),
      `${pipeline} (${inr(pipelineValue)})`,
      `${won} (${inr(revenue)})`,
      `${l2p}% / ${p2pl}% / ${pl2w}%`,
    ];
    const whatsapp: Record<string, unknown>[] = [];
    for (const r of WA_RECIPIENTS) {
      const res = await sendWhatsApp(r.phone, bodyValues);
      whatsapp.push({ name: r.name, ...res });
      if (!res.ok) console.error(`whatsapp funnel report failed for ${r.name}:`, res.error);
    }

    return new Response(JSON.stringify({
      success: true,
      totals: { leads, prospects, pipeline, pipelineValue, won, revenue },
      slack, whatsapp,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("funnel-daily-report failed:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
