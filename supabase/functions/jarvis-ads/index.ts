const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'x-api-key, content-type',
};

const AD_ACCOUNT = 'act_1283298495162727';
const GRAPH = 'https://graph.facebook.com/v21.0';

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const expected = Deno.env.get('JARVIS_ADS_API_KEY');
  const provided = req.headers.get('x-api-key');
  if (!expected || !provided || provided !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const token = Deno.env.get('META_ADS_TOKEN');
  if (!token) {
    return new Response(JSON.stringify({ error: 'META_ADS_TOKEN not configured' }), {
      status: 502,
      headers: jsonHeaders,
    });
  }

  try {
    // 1) Month-to-date totals
    const totalsUrl = new URL(`${GRAPH}/${AD_ACCOUNT}/insights`);
    totalsUrl.searchParams.set('fields', 'spend,impressions,inline_link_clicks,actions');
    totalsUrl.searchParams.set('date_preset', 'this_month');
    totalsUrl.searchParams.set('level', 'account');
    totalsUrl.searchParams.set('access_token', token);

    const totalsRes = await fetch(totalsUrl.toString());
    const totalsText = await totalsRes.text();
    if (!totalsRes.ok) {
      console.error('Meta totals error', totalsRes.status, totalsText);
      return new Response(
        JSON.stringify({ error: `Meta totals API ${totalsRes.status}` }),
        { status: 502, headers: jsonHeaders },
      );
    }
    const totalsJson = JSON.parse(totalsText);
    const row = totalsJson?.data?.[0] ?? {};
    const spend = Number(row.spend ?? 0) || 0;
    const impressions = Number(row.impressions ?? 0) || 0;
    const clicks = Number(row.inline_link_clicks ?? 0) || 0;
    const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
    const actions: Array<{ action_type: string; value: string | number }> = row.actions ?? [];
    const leads = actions
      .filter((a) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped')
      .reduce((sum, a) => sum + (Number(a.value) || 0), 0);
    const cpl = leads > 0 ? Number((spend / leads).toFixed(2)) : null;

    // 2) Daily spend, last 30 days
    const today = new Date();
    const since = new Date(today);
    since.setUTCDate(since.getUTCDate() - 29); // inclusive 30-day window

    const dailyUrl = new URL(`${GRAPH}/${AD_ACCOUNT}/insights`);
    dailyUrl.searchParams.set('fields', 'spend,date_start');
    dailyUrl.searchParams.set('level', 'account');
    dailyUrl.searchParams.set('time_increment', '1');
    dailyUrl.searchParams.set(
      'time_range',
      JSON.stringify({ since: ymd(since), until: ymd(today) }),
    );
    dailyUrl.searchParams.set('access_token', token);

    const dailyRes = await fetch(dailyUrl.toString());
    const dailyText = await dailyRes.text();
    if (!dailyRes.ok) {
      console.error('Meta daily error', dailyRes.status, dailyText);
      return new Response(
        JSON.stringify({ error: `Meta daily API ${dailyRes.status}` }),
        { status: 502, headers: jsonHeaders },
      );
    }
    const dailyJson = JSON.parse(dailyText);
    const byDate: Record<string, number> = {};
    for (const r of dailyJson?.data ?? []) {
      if (r?.date_start) byDate[r.date_start] = Number(r.spend ?? 0) || 0;
    }
    const daily_spend: number[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      daily_spend.push(byDate[ymd(d)] ?? 0);
    }

    return new Response(
      JSON.stringify({
        meta: { spend, impressions, clicks, ctr, leads, cpl, daily_spend },
        fetched_at: new Date().toISOString(),
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (e) {
    console.error('jarvis-ads error', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 502,
      headers: jsonHeaders,
    });
  }
});