import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const IST_OFFSET = 5.5 * 60 * 60 * 1000;

function istDayRange() {
  const now = new Date();
  const nowIST = new Date(now.getTime() + IST_OFFSET);
  const startUTC = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()) - IST_OFFSET);
  return {
    start: startUTC.toISOString(),
    end: now.toISOString(),
    dateLabel: nowIST.toISOString().slice(0, 10),
    timeLabel: `${String(nowIST.getUTCHours()).padStart(2, '0')}:${String(nowIST.getUTCMinutes()).padStart(2, '0')} IST`,
  };
}

function normalizeName(name?: string | null): string | null {
  const cleaned = (name || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  if (['unassigned', 'unknown', 'n/a', 'na', 'null', 'none'].includes(cleaned.toLowerCase())) return null;
  return cleaned;
}

interface Row { name: string; prospects: number; pipeline: number }

function buildTable(rows: Row[], key: 'prospects' | 'pipeline', title: string) {
  const active = rows.filter((r) => r[key] > 0).sort((a, b) => b[key] - a[key]);
  const lines = active.length
    ? active.map((r) => `• *${r.name}* — ${r[key]}`).join('\n')
    : '_No entries yet today_';
  const total = active.reduce((s, r) => s + r[key], 0);
  return { type: 'section', text: { type: 'mrkdwn', text: `*${title}* (total ${total})\n${lines}` } };
}

async function sendToSlack(botToken: string | null, webhookUrl: string | null, channel: string | null, blocks: unknown[], text: string) {
  if (botToken && channel) {
    const r = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel, blocks, text }),
    });
    const j = await r.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (j?.ok) return { ok: true };
    console.error('slack chat.postMessage failed:', j?.error);
    if (!webhookUrl) return { ok: false, error: j?.error || `http ${r.status}` };
  }
  if (webhookUrl) {
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks, text }),
    });
    if (!r.ok) return { ok: false, error: `webhook http ${r.status}` };
    return { ok: true };
  }
  return { ok: false, error: 'no slack destination configured' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const cronSecret = req.headers.get('x-cron-secret');
    const configuredSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');

    let isAuthorized = false;
    if (cronSecret && configuredSecret && cronSecret === configuredSecret) {
      isAuthorized = true;
    } else if (authHeader?.startsWith('Bearer ')) {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user?.id) {
        const admin = createClient(supabaseUrl, serviceKey);
        const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id);
        if (roles?.some((r: { role: string }) => r.role === 'admin' || r.role === 'sales_manager')) isAuthorized = true;
      }
    }
    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let forceRun = false;
    try { forceRun = (await req.json())?.force === true; } catch { /* no body */ }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: settings } = await supabase.from('slack_settings').select('*').limit(1).maybeSingle();

    if (!settings?.is_enabled) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'Slack disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const enabled = (settings as Record<string, unknown>).enable_prospect_pipeline_report ?? false;
    if (!forceRun && !enabled) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'Prospect & pipeline report disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const channel = ((settings as Record<string, unknown>).channel_prospect_pipeline as string | null)
      || ((settings as Record<string, unknown>).channel_sales_report as string | null)
      || null;
    const botToken = Deno.env.get('SLACK_BOT_TOKEN') || null;
    const webhookUrl = Deno.env.get('SLACK_WEBHOOK_URL') || null;

    const { start, end, dateLabel, timeLabel } = istDayRange();

    const [prospectsRes, pipelineRes] = await Promise.all([
      supabase.from('prospects').select('created_by_name').gte('created_at', start).lte('created_at', end),
      supabase.from('pipeline_orders').select('sales_person_name').gte('created_at', start).lte('created_at', end),
    ]);
    if (prospectsRes.error) throw prospectsRes.error;
    if (pipelineRes.error) throw pipelineRes.error;

    const map = new Map<string, Row>();
    const bump = (rawName: string | null | undefined, key: 'prospects' | 'pipeline') => {
      const name = normalizeName(rawName);
      if (!name) return;
      const k = name.toLowerCase();
      if (!map.has(k)) map.set(k, { name, prospects: 0, pipeline: 0 });
      map.get(k)![key] += 1;
    };
    (prospectsRes.data || []).forEach((r: { created_by_name: string | null }) => bump(r.created_by_name, 'prospects'));
    (pipelineRes.data || []).forEach((r: { sales_person_name: string | null }) => bump(r.sales_person_name, 'pipeline'));

    const rows = Array.from(map.values());
    const totalProspects = rows.reduce((s, r) => s + r.prospects, 0);
    const totalPipeline = rows.reduce((s, r) => s + r.pipeline, 0);

    const blocks: unknown[] = [
      { type: 'header', text: { type: 'plain_text', text: `📋 Today's Report — Prospects & Pipeline`, emoji: true } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `📅 ${dateLabel} • 🕒 as of ${timeLabel}` }] },
      { type: 'divider' },
      buildTable(rows, 'prospects', '🎯 Prospects Added'),
      { type: 'divider' },
      buildTable(rows, 'pipeline', '📈 Pipeline Added'),
      { type: 'context', elements: [{ type: 'mrkdwn', text: `Total prospects ${totalProspects} • Total pipeline ${totalPipeline} • XBoom Flow` }] },
    ];

    const result = await sendToSlack(botToken, webhookUrl, channel, blocks,
      `Today's Report — Prospects ${totalProspects}, Pipeline ${totalPipeline}`);

    if (!result.ok) {
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, totalProspects, totalPipeline, people: rows.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('prospect-pipeline-report failed:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
