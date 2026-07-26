import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'x-api-key, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
  }

  const expected = Deno.env.get('JARVIS_REPORT_API_KEY');
  const provided = req.headers.get('x-api-key');
  if (!expected || !provided || provided !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

    // Orders in current month (by order_date per project policy)
    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select('id, total_sales_amount, source, order_date')
      .gte('order_date', monthStart)
      .lt('order_date', nextMonthStart);
    if (ordersErr) throw ordersErr;

    let monthlyRevenue = 0;
    const bySource: Record<string, { count: number; revenue: number }> = {};
    for (const o of orders ?? []) {
      const amt = Number((o as any).total_sales_amount) || 0;
      monthlyRevenue += amt;
      const src = (o.source ?? 'unknown') as string;
      if (!bySource[src]) bySource[src] = { count: 0, revenue: 0 };
      bySource[src].count += 1;
      bySource[src].revenue += amt;
    }

    // Leads grouped by source & status (all-time)
    const { data: leads, error: leadsErr } = await supabase
      .from('leads')
      .select('source, status');
    if (leadsErr) throw leadsErr;

    const leadsBySource: Record<string, number> = {};
    const leadsByStatus: Record<string, number> = {};
    for (const l of leads ?? []) {
      const s = (l.source ?? 'unknown') as string;
      const st = (l.status ?? 'unknown') as string;
      leadsBySource[s] = (leadsBySource[s] ?? 0) + 1;
      leadsByStatus[st] = (leadsByStatus[st] ?? 0) + 1;
    }

    return new Response(
      JSON.stringify({
        generated_at: new Date().toISOString(),
        period: { start: monthStart, end: nextMonthStart },
        orders: {
          monthly_revenue: monthlyRevenue,
          order_count: orders?.length ?? 0,
          by_source: bySource,
        },
        leads: {
          by_source: leadsBySource,
          by_status: leadsByStatus,
          total: leads?.length ?? 0,
        },
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (e) {
    console.error('jarvis-report error', e);
    const err = e as { message?: string; stack?: string; code?: string; details?: string; hint?: string };
    return new Response(
      JSON.stringify({
        error: err?.message ?? String(e),
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        stack: err?.stack,
      }),
      { status: 500, headers: jsonHeaders },
    );
  }
});