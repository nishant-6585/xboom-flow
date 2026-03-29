import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const formatCurrency = (amount: number): string => {
  if (!amount) return '₹0';
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount.toLocaleString('en-IN')}`;
};

const getDateRange = (timeframe: string) => {
  // Use IST (UTC+5:30) for date calculations since business operates in India
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  const nowIST = new Date(now.getTime() + istOffset);
  
  // Get IST midnight as UTC timestamp
  const todayISTMidnight = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()) - istOffset);
  
  if (timeframe === 'daily') {
    return { start: todayISTMidnight.toISOString(), end: now.toISOString(), label: 'Daily' };
  }
  
  if (timeframe === 'weekly') {
    // Use Monday as start of week to match backend analytics and app reporting
    const dayOfWeek = nowIST.getUTCDay(); // 0=Sunday, 1=Monday
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStartIST = new Date(todayISTMidnight.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
    return { start: weekStartIST.toISOString(), end: now.toISOString(), label: 'Weekly' };
  }
  
  // MTD - first day of month in IST
  const monthStartIST = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), 1) - istOffset);
  return { start: monthStartIST.toISOString(), end: now.toISOString(), label: 'Month-to-Date' };
};

async function fetchSalesData(supabase: any, startDate: string, endDate: string) {
  // Fetch all data in parallel
  const [enquiriesRes, prospectsRes, ordersRes, interaktRes, callLogsRes, emailLeadsRes, profilesRes, pipelineRes] = await Promise.all([
    supabase.from('enquiries').select('id, customer_name, product_name, product_category, sales_person_name, sales_person_id, lead_temperature, is_mega_deal, status, created_at, urgency')
      .gte('created_at', startDate).lte('created_at', endDate),
    supabase.from('prospects').select('id, customer_name, source_type, created_by_name, created_at, is_a_category, prospect_type')
      .gte('created_at', startDate).lte('created_at', endDate),
    supabase.from('orders').select('id, order_number, customer_name, product_name, product_category, sales_person_name, sales_person_id, status, total_sales_amount, amount_paid, payment_status, created_at')
      .gte('created_at', startDate).lte('created_at', endDate),
    supabase.from('interakt_contacts').select('id, created_at, is_prospect, sales_person_name')
      .gte('created_at', startDate).lte('created_at', endDate),
    supabase.from('call_logs').select('id, created_at, is_prospect, agent_name, call_status')
      .gte('created_at', startDate).lte('created_at', endDate),
    supabase.from('email_leads').select('id, created_at, is_prospect, sales_person_name')
      .gte('created_at', startDate).lte('created_at', endDate),
    supabase.from('profiles').select('user_id, name').eq('is_approved', true),
    supabase.from('pipeline_orders').select('id, customer_name, product_name, expected_price, probability_to_close, sales_person_name, lead_temperature, status, created_at')
      .gte('created_at', startDate).lte('created_at', endDate),
  ]);

  // Also fetch order items for profit calculation
  const orderIds = (ordersRes.data || []).map((o: any) => o.id);
  let orderItemsData: any[] = [];
  if (orderIds.length > 0) {
    const { data } = await supabase.from('order_items').select('order_id, unit_price, quantity, procurement_rate, sales_price_includes_gst, sales_gst_amount, procurement_price_includes_gst, procurement_gst_amount')
      .in('order_id', orderIds);
    orderItemsData = data || [];
  }

  // Fetch hot leads pending follow-up > 24h
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: stalePipeline } = await supabase.from('pipeline_orders')
    .select('id, customer_name, product_name, sales_person_name, updated_at')
    .eq('lead_temperature', 'hot')
    .not('status', 'in', '(won,lost)')
    .lt('updated_at', twentyFourHoursAgo)
    .limit(10);

  return {
    enquiries: enquiriesRes.data || [],
    prospects: prospectsRes.data || [],
    orders: ordersRes.data || [],
    interakt: interaktRes.data || [],
    callLogs: callLogsRes.data || [],
    emailLeads: emailLeadsRes.data || [],
    profiles: profilesRes.data || [],
    pipeline: pipelineRes.data || [],
    orderItems: orderItemsData,
    stalePipeline: stalePipeline || [],
  };
}

function aggregateData(data: any) {
  const { enquiries, prospects, orders, interakt, callLogs, emailLeads, pipeline, orderItems, stalePipeline } = data;

  // Leads by source
  const leadsBySource = {
    enquiries: enquiries.length,
    interakt: interakt.length,
    myoperator: callLogs.length,
    email: emailLeads.length,
    total: enquiries.length + interakt.length + callLogs.length + emailLeads.length,
  };

  // Prospects
  const prospectCount = prospects.length;
  const aCategoryCount = prospects.filter((p: any) => p.is_a_category).length;

  // Orders won
  const wonOrders = orders.filter((o: any) => !['cancelled'].includes(o.status));
  const totalRevenue = wonOrders.reduce((sum: number, o: any) => sum + (o.total_sales_amount || 0), 0);

  // Calculate profit from order items
  let totalProfit = 0;
  for (const item of orderItems) {
    const salesPrice = item.sales_price_includes_gst
      ? (item.unit_price - (item.sales_gst_amount || 0)) * item.quantity
      : item.unit_price * item.quantity;
    const costPrice = item.procurement_price_includes_gst
      ? ((item.procurement_rate || 0) - (item.procurement_gst_amount || 0)) * item.quantity
      : (item.procurement_rate || 0) * item.quantity;
    totalProfit += salesPrice - costPrice;
  }

  // Salesperson performance
  const salesPersonMap = new Map<string, { leads: number; orders: number; revenue: number; profit: number; prospects: number }>();
  
  for (const e of enquiries) {
    const name = e.sales_person_name || 'Unassigned';
    const sp = salesPersonMap.get(name) || { leads: 0, orders: 0, revenue: 0, profit: 0, prospects: 0 };
    sp.leads++;
    salesPersonMap.set(name, sp);
  }

  for (const o of wonOrders) {
    const name = o.sales_person_name || 'Unassigned';
    const sp = salesPersonMap.get(name) || { leads: 0, orders: 0, revenue: 0, profit: 0, prospects: 0 };
    sp.orders++;
    sp.revenue += o.total_sales_amount || 0;
    salesPersonMap.set(name, sp);
  }

  for (const p of prospects) {
    const name = p.created_by_name || 'Unknown';
    const sp = salesPersonMap.get(name) || { leads: 0, orders: 0, revenue: 0, profit: 0, prospects: 0 };
    sp.prospects++;
    salesPersonMap.set(name, sp);
  }

  // Distribute profit by salesperson based on their revenue share
  if (totalRevenue > 0) {
    for (const [name, sp] of salesPersonMap) {
      sp.profit = totalProfit * (sp.revenue / totalRevenue);
      salesPersonMap.set(name, sp);
    }
  }

  // Category performance
  const categoryMap = new Map<string, { orders: number; revenue: number; profit: number }>();
  for (const o of wonOrders) {
    const cat = o.product_category || 'Uncategorized';
    const c = categoryMap.get(cat) || { orders: 0, revenue: 0, profit: 0 };
    c.orders++;
    c.revenue += o.total_sales_amount || 0;
    categoryMap.set(cat, c);
  }

  // Hot leads & pipeline
  const hotLeads = [...enquiries.filter((e: any) => e.lead_temperature === 'hot'), ...pipeline.filter((p: any) => p.lead_temperature === 'hot')];
  const megaDeals = [...enquiries.filter((e: any) => e.is_mega_deal), ...pipeline.filter((p: any) => (p as any).is_mega_deal)];
  const pipelineValue = pipeline.reduce((sum: number, p: any) => sum + ((p.expected_price || 0) * (p.probability_to_close || 0) / 100), 0);

  // Top performer
  let topPerformer = { name: 'N/A', profit: 0 };
  for (const [name, sp] of salesPersonMap) {
    if (sp.profit > topPerformer.profit) {
      topPerformer = { name, profit: sp.profit };
    }
  }

  return {
    leadsBySource,
    prospectCount,
    aCategoryCount,
    ordersWon: wonOrders.length,
    totalRevenue,
    totalProfit,
    salesPersonPerformance: Object.fromEntries(salesPersonMap),
    categoryPerformance: Object.fromEntries(categoryMap),
    hotLeads: hotLeads.length,
    megaDeals: megaDeals.length,
    pipelineValue,
    stalePipeline,
    topPerformer,
  };
}

async function generateAIInsights(aggregated: any, timeframeLabel: string): Promise<{ insights: string[]; risks: string[]; opportunities: string[]; recommendations: string[] }> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    return { insights: ['AI insights unavailable - API key not configured'], risks: [], opportunities: [], recommendations: [] };
  }

  const prompt = `You are a sales analytics AI for XBoom (a drone company). Analyze this ${timeframeLabel} sales data and provide actionable insights.

DATA:
- Total Leads: ${aggregated.leadsBySource.total} (Enquiries: ${aggregated.leadsBySource.enquiries}, Interakt: ${aggregated.leadsBySource.interakt}, MyOperator: ${aggregated.leadsBySource.myoperator}, Email: ${aggregated.leadsBySource.email})
- Prospects Qualified: ${aggregated.prospectCount} (A-Category: ${aggregated.aCategoryCount})
- Orders Won: ${aggregated.ordersWon}
- Revenue: ₹${aggregated.totalRevenue}
- Profit: ₹${aggregated.totalProfit}
- Hot Leads: ${aggregated.hotLeads}
- Mega Deals: ${aggregated.megaDeals}
- Pipeline Value (weighted): ₹${Math.round(aggregated.pipelineValue)}
- Stale Hot Leads (>24h no update): ${aggregated.stalePipeline.length}
- Top Performer: ${aggregated.topPerformer.name} (₹${Math.round(aggregated.topPerformer.profit)} profit)

Salesperson Performance: ${JSON.stringify(aggregated.salesPersonPerformance)}
Category Performance: ${JSON.stringify(aggregated.categoryPerformance)}

Return STRICTLY valid JSON:
{
  "insights": ["max 3 key observations about patterns"],
  "risks": ["max 2 business risks detected"],
  "opportunities": ["max 2 growth opportunities"],
  "recommendations": ["max 3 specific actionable steps"]
}

Be concise (each item max 100 chars). Focus on conversion rates, channel efficiency, stale leads, and profit margins.`;

  try {
    const response = await fetch('https://api.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error('AI API error:', response.status);
      return { insights: ['AI analysis temporarily unavailable'], risks: [], opportunities: [], recommendations: [] };
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty AI response');

    const parsed = JSON.parse(content);
    return {
      insights: Array.isArray(parsed.insights) ? parsed.insights.slice(0, 3) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 2) : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.slice(0, 2) : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 3) : [],
    };
  } catch (error) {
    console.error('AI insights error:', error);
    return { insights: ['AI analysis temporarily unavailable'], risks: [], opportunities: [], recommendations: [] };
  }
}

function buildSlackBlocks(aggregated: any, aiInsights: any, timeframeLabel: string, enableAI: boolean, enableActions: boolean) {
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  
  const blocks: any[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `📊 Sales Report — ${timeframeLabel} (${dateStr})`, emoji: true }
    },
    { type: "divider" },
    // Summary
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*🔥 Summary*\n• Leads: *${aggregated.leadsBySource.total}*\n• Prospects: *${aggregated.prospectCount}* (A-Category: ${aggregated.aCategoryCount})\n• Orders Won: *${aggregated.ordersWon}*\n• Revenue: *${formatCurrency(aggregated.totalRevenue)}*\n• Profit: *${formatCurrency(aggregated.totalProfit)}*`
      }
    },
    { type: "divider" },
    // Leads by Source
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*📥 Leads by Source*\n• Enquiries: ${aggregated.leadsBySource.enquiries}\n• Interakt: ${aggregated.leadsBySource.interakt}\n• MyOperator: ${aggregated.leadsBySource.myoperator}\n• Email: ${aggregated.leadsBySource.email}`
      }
    },
    { type: "divider" },
  ];

  // Salesperson Performance
  const spEntries = Object.entries(aggregated.salesPersonPerformance) as [string, any][];
  if (spEntries.length > 0) {
    let spText = '*👤 Salesperson Performance*\n';
    spEntries.sort((a, b) => b[1].revenue - a[1].revenue);
    for (const [name, sp] of spEntries.slice(0, 8)) {
      spText += `• ${name} → ${sp.orders} orders | ${formatCurrency(sp.revenue)} rev | ${formatCurrency(Math.round(sp.profit))} profit | ${sp.prospects} prospects\n`;
    }
    blocks.push({ type: "section", text: { type: "mrkdwn", text: spText } });
    blocks.push({ type: "divider" });
  }

  // Category Performance
  const catEntries = Object.entries(aggregated.categoryPerformance) as [string, any][];
  if (catEntries.length > 0) {
    let catText = '*📦 Category Performance*\n';
    catEntries.sort((a, b) => b[1].revenue - a[1].revenue);
    for (const [cat, c] of catEntries.slice(0, 6)) {
      catText += `• ${cat} → ${c.orders} orders | ${formatCurrency(c.revenue)} rev\n`;
    }
    blocks.push({ type: "section", text: { type: "mrkdwn", text: catText } });
    blocks.push({ type: "divider" });
  }

  // Top Performer & Stale Leads
  if (aggregated.topPerformer.name !== 'N/A') {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `🏆 *Top Performer:* ${aggregated.topPerformer.name} (${formatCurrency(Math.round(aggregated.topPerformer.profit))} profit)` }
    });
  }

  if (aggregated.stalePipeline.length > 0) {
    let staleText = `⚠️ *${aggregated.stalePipeline.length} Hot Lead(s) Pending >24h:*\n`;
    for (const s of aggregated.stalePipeline.slice(0, 5)) {
      staleText += `• ${s.customer_name} — ${s.product_name} (${s.sales_person_name})\n`;
    }
    blocks.push({ type: "section", text: { type: "mrkdwn", text: staleText } });
  }

  blocks.push({ type: "divider" });

  // AI Insights
  if (enableAI && aiInsights) {
    let aiText = '*🧠 AI Insights*\n';
    for (const i of aiInsights.insights) aiText += `• ${i}\n`;
    blocks.push({ type: "section", text: { type: "mrkdwn", text: aiText } });

    if (aiInsights.risks.length > 0) {
      let riskText = '*⚠️ Risks*\n';
      for (const r of aiInsights.risks) riskText += `• ${r}\n`;
      blocks.push({ type: "section", text: { type: "mrkdwn", text: riskText } });
    }

    if (aiInsights.opportunities.length > 0) {
      let oppText = '*🚀 Opportunities*\n';
      for (const o of aiInsights.opportunities) oppText += `• ${o}\n`;
      blocks.push({ type: "section", text: { type: "mrkdwn", text: oppText } });
    }

    if (aiInsights.recommendations.length > 0) {
      let recText = '*💡 Recommendations*\n';
      for (const r of aiInsights.recommendations) recText += `• ${r}\n`;
      blocks.push({ type: "section", text: { type: "mrkdwn", text: recText } });
    }

    blocks.push({ type: "divider" });
  }

  // Interactive Action Buttons
  if (enableActions) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "🔥 Follow Up Hot Leads", emoji: true },
          style: "danger",
          action_id: "follow_up_hot_leads",
          value: "hot_leads"
        },
        {
          type: "button",
          text: { type: "plain_text", text: "📊 View Full Dashboard", emoji: true },
          url: `https://xboom-flow.lovable.app/sales`,
          action_id: "open_dashboard"
        },
      ]
    });

    if (aggregated.stalePipeline.length > 0) {
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "⚡ Assign Stale Leads", emoji: true },
            action_id: "assign_stale_leads",
            value: "stale_leads"
          },
          {
            type: "button",
            text: { type: "plain_text", text: "📩 Send Reminders", emoji: true },
            action_id: "send_reminders",
            value: "reminders"
          },
        ]
      });
    }
  }

  // Footer
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `📅 Report generated at ${new Date().toLocaleString('en-IN')} • XBoom Flow` }]
  });

  return blocks;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Auth: accept cron secret OR valid JWT
    const cronSecret = req.headers.get('x-cron-secret');
    const configuredSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');
    
    let isAuthorized = false;
    
    if (cronSecret && configuredSecret && cronSecret === configuredSecret) {
      isAuthorized = true;
    } else if (authHeader?.startsWith('Bearer ')) {
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (!userError && user?.id) {
        // Verify admin role
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
        if (roles?.some((r: any) => r.role === 'admin' || r.role === 'sales_manager')) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let timeframe = 'daily';
    let forceRun = false;
    try {
      const body = await req.json();
      timeframe = body.timeframe || 'daily';
      forceRun = body.force === true;
    } catch { /* default values */ }

    // Validate timeframe
    if (!['daily', 'weekly', 'mtd'].includes(timeframe)) {
      return new Response(JSON.stringify({ error: 'Invalid timeframe' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get slack settings
    const { data: settings } = await supabase.from('slack_settings').select('*').limit(1).single();
    
    if (!settings?.is_enabled) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'Slack disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const enableDailyReport = settings.enable_daily_report ?? false;
    const enableWeeklyReport = settings.enable_weekly_report ?? false;
    const enableAI = settings.enable_ai_insights ?? true;
    const enableActions = settings.enable_interactive_actions ?? true;
    const reportChannel = settings.channel_sales_report;

    if (!forceRun) {
      if (timeframe === 'daily' && !enableDailyReport) {
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'Daily report disabled' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (timeframe === 'weekly' && !enableWeeklyReport) {
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'Weekly report disabled' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const botToken = Deno.env.get('SLACK_BOT_TOKEN');
    const webhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');

    if (!botToken && !webhookUrl) {
      return new Response(JSON.stringify({ success: false, error: 'No Slack credentials configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch and aggregate data
    const { start, end, label } = getDateRange(timeframe);
    const rawData = await fetchSalesData(supabase, start, end);
    const aggregated = aggregateData(rawData);

    // No activity check
    if (aggregated.leadsBySource.total === 0 && aggregated.ordersWon === 0 && aggregated.prospectCount === 0) {
      const noActivityBlocks = [
        { type: "header", text: { type: "plain_text", text: `📊 Sales Report — ${label}`, emoji: true } },
        { type: "section", text: { type: "mrkdwn", text: "📭 *No sales activity recorded for this period.*\nCheck back later or review the dashboard for historical data." } },
        { type: "context", elements: [{ type: "mrkdwn", text: `📅 ${new Date().toLocaleString('en-IN')} • XBoom Flow` }] }
      ];

      await sendReportToSlack({
        botToken,
        webhookUrl,
        channel: reportChannel,
        blocks: noActivityBlocks,
      });

      // Log execution
      await supabase.from('ai_action_logs').insert({
        action_type: 'sales_report',
        user_id: '00000000-0000-0000-0000-000000000000',
        payload: { timeframe, no_activity: true },
        status: 'completed',
      });

      return new Response(JSON.stringify({ success: true, no_activity: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate AI insights
    let aiInsights = null;
    if (enableAI) {
      aiInsights = await generateAIInsights(aggregated, label);
    }

    // Build Slack blocks
    const blocks = buildSlackBlocks(aggregated, aiInsights, label, enableAI, enableActions);

    // Send to Slack
    await sendReportToSlack({
      botToken,
      webhookUrl,
      channel: reportChannel,
      blocks,
    });

    // Log execution
    await supabase.from('ai_action_logs').insert({
      action_type: 'sales_report',
      user_id: '00000000-0000-0000-0000-000000000000',
      payload: { timeframe, aggregated: { leads: aggregated.leadsBySource.total, orders: aggregated.ordersWon, revenue: aggregated.totalRevenue } },
      result: aiInsights ? { ai_insights: true } : null,
      status: 'completed',
    });

    return new Response(JSON.stringify({ success: true, timeframe, aggregated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Sales report error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function sendBotMessage(botToken: string, channel: string, blocks: any[]) {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, blocks }),
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || 'Slack API error');
  return result;
}

async function sendWebhook(webhookUrl: string, blocks: any[]) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  });
  if (!response.ok) throw new Error(await response.text());
}

async function sendReportToSlack({
  botToken,
  webhookUrl,
  channel,
  blocks,
}: {
  botToken?: string | null;
  webhookUrl?: string | null;
  channel?: string | null;
  blocks: any[];
}) {
  if (botToken && channel) {
    try {
      await sendBotMessage(botToken, channel, blocks);
      return;
    } catch (error) {
      console.error('Sales report bot send failed, falling back to webhook:', error);
    }
  }

  if (webhookUrl) {
    await sendWebhook(webhookUrl, blocks);
    return;
  }

  console.log('No report channel or webhook configured');
}
