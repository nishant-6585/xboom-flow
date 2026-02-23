import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Authentication: require admin/finance JWT or cron secret
    const authHeader = req.headers.get('Authorization');
    const cronSecret = req.headers.get('X-Cron-Secret');
    const expectedCronSecret = Deno.env.get('CRON_SECRET');

    if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
      // Authenticated via cron secret
    } else if (authHeader?.startsWith('Bearer ')) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const checkClient = createClient(supabaseUrl, supabaseKey);
      const { data: roles } = await checkClient
        .from('user_roles')
        .select('role')
        .eq('user_id', claimsData.claims.sub)
        .in('role', ['admin', 'finance']);
      if (!roles || roles.length === 0) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Optional: score a single invoice
    let targetInvoiceId: string | null = null;
    try {
      const body = await req.json();
      targetInvoiceId = body?.invoice_id || null;
    } catch { /* no body = batch mode */ }

    // 1. Get invoices to score
    let query = supabase
      .from('invoices')
      .select('id, invoice_number, customer_name, customer_company, total_amount, invoice_date, due_date, paid_date, status, amount_paid, balance_due')
      .neq('status', 'draft');

    if (targetInvoiceId) {
      query = query.eq('id', targetInvoiceId);
    }

    const { data: invoices, error: invError } = await query;
    if (invError) throw invError;
    if (!invoices || invoices.length === 0) {
      return new Response(JSON.stringify({ message: 'No invoices to score', scored: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Build customer payment history
    const { data: allInvoices } = await supabase
      .from('invoices')
      .select('customer_company, customer_name, invoice_date, due_date, paid_date, total_amount, status');

    const customerHistory: Record<string, { avgDaysToPay: number; count: number; lateCount: number; variance: number }> = {};

    for (const inv of (allInvoices || [])) {
      if (!inv.paid_date || !inv.due_date) continue;
      const key = inv.customer_company || inv.customer_name;
      
      const dueDate = new Date(inv.due_date);
      const paidDate = new Date(inv.paid_date);
      const daysToPay = Math.floor((paidDate.getTime() - new Date(inv.invoice_date).getTime()) / (1000 * 60 * 60 * 24));
      const wasLate = paidDate > dueDate;

      if (!customerHistory[key]) {
        customerHistory[key] = { avgDaysToPay: 0, count: 0, lateCount: 0, variance: 0 };
      }
      const h = customerHistory[key];
      const prevAvg = h.avgDaysToPay;
      h.count++;
      h.avgDaysToPay = prevAvg + (daysToPay - prevAvg) / h.count;
      h.variance += (daysToPay - prevAvg) * (daysToPay - h.avgDaysToPay);
      if (wasLate) h.lateCount++;
    }

    // Finalize variance
    for (const key of Object.keys(customerHistory)) {
      const h = customerHistory[key];
      h.variance = h.count > 1 ? h.variance / (h.count - 1) : 0;
    }

    // 3. Score each invoice
    const results: any[] = [];
    const now = new Date();

    for (const inv of invoices) {
      try {
        // Skip fully paid invoices for scoring (but log accuracy)
        if (inv.status === 'paid') {
          // Log accuracy if we had a previous score
          const { data: prevScore } = await supabase
            .from('payment_risk_scores')
            .select('*')
            .eq('invoice_id', inv.id)
            .order('scored_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (prevScore && inv.paid_date && inv.invoice_date) {
            const actualDays = Math.floor(
              (new Date(inv.paid_date).getTime() - new Date(inv.invoice_date).getTime()) / (1000 * 60 * 60 * 24)
            );
            const wasLate = inv.due_date ? new Date(inv.paid_date) > new Date(inv.due_date) : false;

            await supabase.from('payment_risk_accuracy_log').insert({
              score_id: prevScore.id,
              invoice_id: inv.id,
              customer_company: inv.customer_company,
              predicted_risk_level: prevScore.risk_level,
              predicted_days_to_pay: prevScore.predicted_days_to_pay,
              actual_days_to_pay: actualDays,
              was_late: wasLate,
              model_version: prevScore.model_version,
            });
          }
          continue;
        }

        const customerKey = inv.customer_company || inv.customer_name;
        const history = customerHistory[customerKey];
        const factors: Record<string, any> = {};

        let riskScore = 0;

        // Factor 1: Historical payment pattern (weight: 0.35)
        if (history && history.count >= 2) {
          const lateRatio = history.lateCount / history.count;
          factors.historical_late_ratio = Math.round(lateRatio * 100) / 100;
          factors.avg_days_to_pay = Math.round(history.avgDaysToPay);
          factors.payment_count = history.count;
          riskScore += lateRatio * 0.35;
        } else {
          // No history = moderate uncertainty
          factors.no_history = true;
          riskScore += 0.15;
        }

        // Factor 2: Current aging bucket (weight: 0.30)
        if (inv.due_date) {
          const dueDate = new Date(inv.due_date);
          const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          factors.days_overdue = daysOverdue;

          if (daysOverdue > 90) riskScore += 0.30;
          else if (daysOverdue > 60) riskScore += 0.25;
          else if (daysOverdue > 30) riskScore += 0.18;
          else if (daysOverdue > 0) riskScore += 0.10;
          else riskScore += 0; // not yet due
        }

        // Factor 3: Invoice amount relative to customer average (weight: 0.15)
        if (history && history.count > 0) {
          const customerAvgAmount = (allInvoices || [])
            .filter(i => (i.customer_company || i.customer_name) === customerKey)
            .reduce((sum, i) => sum + (i.total_amount || 0), 0) / history.count;

          const amountRatio = inv.total_amount / (customerAvgAmount || 1);
          factors.amount_ratio = Math.round(amountRatio * 100) / 100;
          
          if (amountRatio > 2) riskScore += 0.15;
          else if (amountRatio > 1.5) riskScore += 0.10;
          else riskScore += 0.03;
        }

        // Factor 4: Payment consistency / variance (weight: 0.20)
        if (history && history.count >= 3) {
          const stdDev = Math.sqrt(history.variance);
          factors.payment_std_dev_days = Math.round(stdDev);
          
          if (stdDev > 20) riskScore += 0.20;
          else if (stdDev > 10) riskScore += 0.12;
          else riskScore += 0.03;
        }

        // Clamp score
        riskScore = Math.min(1, Math.max(0, Math.round(riskScore * 100) / 100));

        // Determine risk level
        let riskLevel: string;
        if (riskScore >= 0.75) riskLevel = 'critical';
        else if (riskScore >= 0.5) riskLevel = 'high';
        else if (riskScore >= 0.25) riskLevel = 'medium';
        else riskLevel = 'low';

        // Predicted days to pay
        const predictedDays = history
          ? Math.round(history.avgDaysToPay * (1 + riskScore * 0.5))
          : null;

        // Insert score
        const { error: insertErr } = await supabase.from('payment_risk_scores').insert({
          invoice_id: inv.id,
          customer_company: inv.customer_company,
          customer_name: inv.customer_name,
          risk_score: riskScore,
          risk_level: riskLevel,
          predicted_days_to_pay: predictedDays,
          factors,
          model_version: 'v1-heuristic',
        });

        if (insertErr) {
          console.error(`Score error for ${inv.invoice_number}:`, insertErr);
        } else {
          results.push({ invoice: inv.invoice_number, risk_level: riskLevel, risk_score: riskScore });
        }
      } catch (itemError) {
        console.error(`Failed to score invoice ${inv.id}:`, itemError);
      }
    }

    return new Response(JSON.stringify({
      message: 'Payment risk scoring completed',
      scored: results.length,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Payment risk scoring error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
