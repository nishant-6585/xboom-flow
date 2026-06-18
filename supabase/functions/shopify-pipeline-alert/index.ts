import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Thresholds (override via env if desired)
const STALL_SECONDS = Number(Deno.env.get("SHOPIFY_ALERT_STALL_SECONDS") ?? 15 * 60); // 15 min
const WEBHOOK_SILENCE_SECONDS = Number(
  Deno.env.get("SHOPIFY_ALERT_WEBHOOK_SILENCE_SECONDS") ?? 60 * 60
); // 60 min
const COOLDOWN_SECONDS = Number(Deno.env.get("SHOPIFY_ALERT_COOLDOWN_SECONDS") ?? 30 * 60); // 30 min

type AlertKey = "failed_rows" | "queue_stalled" | "webhook_silence";

interface Metrics {
  pending_count: number;
  failed_count: number;
  processing_count: number;
  completed_count: number;
  last_processed_at: string | null;
  last_webhook_received_at: string | null;
  oldest_pending_age_seconds: number | null;
}

async function postSlack(
  botToken: string,
  channel: string,
  text: string,
  blocks: unknown[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel, text, blocks }),
    });
    const j = (await r.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;
    if (!j?.ok) return { ok: false, error: j?.error ?? `HTTP ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function buildBlocks(
  key: AlertKey,
  metrics: Metrics
): { text: string; blocks: unknown[] } {
  const fmtAge = (s: number | null) => {
    if (s === null) return "n/a";
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  };

  const titles: Record<AlertKey, string> = {
    failed_rows: "🚨 Shopify pipeline: failed rows detected",
    queue_stalled: "⏰ Shopify pipeline: queue stalled",
    webhook_silence: "📡 Shopify pipeline: no webhooks received",
  };

  const summaries: Record<AlertKey, string> = {
    failed_rows: `*${metrics.failed_count}* raw webhook row(s) marked as \`failed\`. Check the Shopify Pipeline Monitor.`,
    queue_stalled: `Oldest pending order has been waiting *${fmtAge(metrics.oldest_pending_age_seconds)}* (threshold ${Math.round(
      STALL_SECONDS / 60
    )}m). The processor may not be running.`,
    webhook_silence: `No Shopify webhooks received for *${fmtAge(
      metrics.last_webhook_received_at
        ? Math.floor(
            (Date.now() - new Date(metrics.last_webhook_received_at).getTime()) / 1000
          )
        : null
    )}*. Verify the Shopify→Lovable webhook is still registered.`,
  };

  const text = `${titles[key]} — ${summaries[key]}`;

  const blocks = [
    { type: "header", text: { type: "plain_text", text: titles[key], emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: summaries[key] } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Pending:*\n${metrics.pending_count}` },
        { type: "mrkdwn", text: `*Processing:*\n${metrics.processing_count}` },
        { type: "mrkdwn", text: `*Failed:*\n${metrics.failed_count}` },
        { type: "mrkdwn", text: `*Completed:*\n${metrics.completed_count.toLocaleString()}` },
        {
          type: "mrkdwn",
          text: `*Last processed:*\n${metrics.last_processed_at ?? "never"}`,
        },
        {
          type: "mrkdwn",
          text: `*Last webhook:*\n${metrics.last_webhook_received_at ?? "never"}`,
        },
      ],
    },
    { type: "divider" },
  ];

  return { text, blocks };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: accept either an admin JWT or a cron secret.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const headerCronSecret = req.headers.get("x-cron-secret");
  const isCron = !!cronSecret && headerCronSecret === cronSecret;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  if (!isCron) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims } = await userClient.auth.getClaims(token);
    if (!claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const svc = createClient(supabaseUrl, serviceRoleKey);
    const { data: role } = await svc
      .from("user_roles")
      .select("role")
      .eq("user_id", claims.claims.sub)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const svc = createClient(supabaseUrl, serviceRoleKey);

  // ── Gather metrics ────────────────────────────────────────────────────────
  const [pendingRes, failedRes, processingRes, completedRes, lastProcRes, lastWebhookRes, oldestPendingRes] =
    await Promise.all([
      svc.from("shopify_orders_raw").select("id", { count: "exact", head: true }).eq("processing_status", "pending"),
      svc.from("shopify_orders_raw").select("id", { count: "exact", head: true }).eq("processing_status", "failed"),
      svc.from("shopify_orders_raw").select("id", { count: "exact", head: true }).eq("processing_status", "processing"),
      svc.from("shopify_orders_raw").select("id", { count: "exact", head: true }).eq("processing_status", "completed"),
      svc.from("shopify_orders_raw").select("processed_at").not("processed_at", "is", null).order("processed_at", { ascending: false }).limit(1).maybeSingle(),
      svc.from("shopify_orders_raw").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      svc.from("shopify_orders_raw").select("created_at").eq("processing_status", "pending").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    ]);

  const oldestPendingAt = oldestPendingRes.data?.created_at as string | undefined;
  const oldestPendingAgeSeconds = oldestPendingAt
    ? Math.floor((Date.now() - new Date(oldestPendingAt).getTime()) / 1000)
    : null;

  const metrics: Metrics = {
    pending_count: pendingRes.count ?? 0,
    failed_count: failedRes.count ?? 0,
    processing_count: processingRes.count ?? 0,
    completed_count: completedRes.count ?? 0,
    last_processed_at: (lastProcRes.data?.processed_at as string | undefined) ?? null,
    last_webhook_received_at: (lastWebhookRes.data?.created_at as string | undefined) ?? null,
    oldest_pending_age_seconds: oldestPendingAgeSeconds,
  };

  // ── Decide which alerts fire ──────────────────────────────────────────────
  const conditions: AlertKey[] = [];
  if (metrics.failed_count > 0) conditions.push("failed_rows");
  if (
    metrics.oldest_pending_age_seconds !== null &&
    metrics.oldest_pending_age_seconds > STALL_SECONDS
  ) {
    conditions.push("queue_stalled");
  }
  if (metrics.last_webhook_received_at) {
    const ageSec = Math.floor(
      (Date.now() - new Date(metrics.last_webhook_received_at).getTime()) / 1000
    );
    if (ageSec > WEBHOOK_SILENCE_SECONDS) conditions.push("webhook_silence");
  }

  if (conditions.length === 0) {
    return new Response(
      JSON.stringify({ status: "ok", fired: [], metrics }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Slack config ──────────────────────────────────────────────────────────
  const botToken = Deno.env.get("SLACK_BOT_TOKEN");
  const { data: slackSettings } = await svc
    .from("slack_settings")
    .select("is_enabled, channel_orders, channel_tickets, channel_order_status")
    .limit(1)
    .maybeSingle();

  const channel =
    Deno.env.get("SHOPIFY_ALERT_SLACK_CHANNEL") ??
    (slackSettings?.channel_order_status as string | null | undefined) ??
    (slackSettings?.channel_orders as string | null | undefined) ??
    (slackSettings?.channel_tickets as string | null | undefined) ??
    null;

  if (!botToken || !slackSettings?.is_enabled || !channel) {
    return new Response(
      JSON.stringify({
        status: "skipped",
        reason: !botToken
          ? "SLACK_BOT_TOKEN missing"
          : !slackSettings?.is_enabled
          ? "Slack notifications disabled"
          : "No alert channel configured",
        fired: conditions,
        metrics,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── De-dup by cooldown, then send ────────────────────────────────────────
  const fired: string[] = [];
  const skipped: { key: AlertKey; reason: string }[] = [];
  const errors: { key: AlertKey; error: string }[] = [];

  for (const key of conditions) {
    const { data: state } = await svc
      .from("shopify_pipeline_alert_state")
      .select("last_alerted_at")
      .eq("alert_key", key)
      .maybeSingle();

    if (state?.last_alerted_at) {
      const ageSec =
        (Date.now() - new Date(state.last_alerted_at as string).getTime()) / 1000;
      if (ageSec < COOLDOWN_SECONDS) {
        skipped.push({ key, reason: `cooldown (${Math.round(ageSec)}s < ${COOLDOWN_SECONDS}s)` });
        continue;
      }
    }

    const { text, blocks } = buildBlocks(key, metrics);
    const res = await postSlack(botToken, channel, text, blocks);
    if (!res.ok) {
      errors.push({ key, error: res.error ?? "unknown" });
      console.error(`Slack alert failed for ${key}: ${res.error}`);
      continue;
    }

    await svc.from("shopify_pipeline_alert_state").upsert(
      {
        alert_key: key,
        last_alerted_at: new Date().toISOString(),
        last_payload: metrics as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "alert_key" }
    );
    fired.push(key);
  }

  return new Response(
    JSON.stringify({ status: "ok", fired, skipped, errors, metrics }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});