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

    // Authentication: require admin/supply_chain JWT or cron secret
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
        .in('role', ['admin', 'supply_chain']);
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

    // 1. Get all inventory items
    const { data: inventory, error: invError } = await supabase
      .from('inventory')
      .select('id, product_name, product_category, current_stock');

    if (invError) throw invError;
    if (!inventory || inventory.length === 0) {
      return new Response(JSON.stringify({ message: 'No inventory items found', forecasts: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    const results: any[] = [];

    for (const item of inventory) {
      try {
        // 2. Get consumption transactions (negative qty = outgoing)
        const { data: transactions } = await supabase
          .from('inventory_transactions')
          .select('quantity, created_at')
          .eq('inventory_id', item.id)
          .lt('quantity', 0)
          .order('created_at', { ascending: false });

        const txns = transactions || [];
        
        // Calculate historical data span
        let historicalDataDays = 0;
        if (txns.length > 0) {
          const oldest = new Date(txns[txns.length - 1].created_at);
          historicalDataDays = Math.floor((now.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24));
        }

        // Confidence based on data availability
        let confidence: 'low' | 'medium' | 'high' = 'low';
        if (historicalDataDays >= 90) confidence = 'high';
        else if (historicalDataDays >= 60) confidence = 'medium';

        // Rolling mean calculations (absolute values of negative qty)
        const calcAvgDailyConsumption = (days: number): number => {
          const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
          const periodTxns = txns.filter(t => new Date(t.created_at) >= cutoff);
          const totalConsumed = periodTxns.reduce((sum, t) => sum + Math.abs(t.quantity), 0);
          return days > 0 ? totalConsumed / days : 0;
        };

        const avg30d = calcAvgDailyConsumption(30);
        const avg60d = calcAvgDailyConsumption(60);
        const avg90d = calcAvgDailyConsumption(90);

        // Primary prediction = rolling 30-day mean (v1 baseline model)
        const predictedDailyDemand = avg30d;

        // Days to stockout
        const daysToStockout = predictedDailyDemand > 0
          ? Math.round((item.current_stock / predictedDailyDemand) * 10) / 10
          : null;

        // Recommended reorder qty = 30 days worth of stock
        const recommendedReorderQty = predictedDailyDemand > 0
          ? Math.ceil(predictedDailyDemand * 30)
          : null;

        // Upsert forecast (one per product, latest wins)
        const { error: upsertError } = await supabase
          .from('demand_forecasts')
          .insert({
            product_id: item.id,
            product_name: item.product_name,
            product_category: item.product_category,
            forecast_date: now.toISOString().split('T')[0],
            predicted_daily_demand: Math.round(predictedDailyDemand * 100) / 100,
            days_to_stockout: daysToStockout,
            recommended_reorder_qty: recommendedReorderQty,
            current_stock: item.current_stock,
            avg_consumption_30d: Math.round(avg30d * 100) / 100,
            avg_consumption_60d: Math.round(avg60d * 100) / 100,
            avg_consumption_90d: Math.round(avg90d * 100) / 100,
            confidence,
            historical_data_days: historicalDataDays,
            model_version: 'v1-rolling-mean',
          });

        if (upsertError) {
          console.error(`Forecast error for ${item.product_name}:`, upsertError);
        } else {
          results.push({ product: item.product_name, confidence, daysToStockout });
        }
      } catch (itemError) {
        // Fail-safe: log error, continue to next product
        console.error(`Failed to forecast ${item.product_name}:`, itemError);
      }
    }

    // 3. Accuracy check: compare forecasts from 7 days ago against actuals
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: oldForecasts } = await supabase
      .from('demand_forecasts')
      .select('*')
      .eq('forecast_date', weekAgo);

    if (oldForecasts && oldForecasts.length > 0) {
      for (const forecast of oldForecasts) {
        try {
          // Get actual consumption over the past 7 days since that forecast
          const { data: actualTxns } = await supabase
            .from('inventory_transactions')
            .select('quantity')
            .eq('inventory_id', forecast.product_id)
            .lt('quantity', 0)
            .gte('created_at', weekAgo)
            .lt('created_at', now.toISOString().split('T')[0]);

          const actualDemand = (actualTxns || []).reduce((sum, t) => sum + Math.abs(t.quantity), 0);
          const predictedDemand = forecast.predicted_daily_demand * 7;
          
          const mape = predictedDemand > 0
            ? Math.round((Math.abs(actualDemand - predictedDemand) / predictedDemand) * 100 * 100) / 100
            : null;

          await supabase.from('forecast_accuracy_log').insert({
            forecast_id: forecast.id,
            product_id: forecast.product_id,
            product_name: forecast.product_name,
            predicted_demand: Math.round(predictedDemand * 100) / 100,
            actual_demand: actualDemand,
            measurement_period_days: 7,
            mape_percent: mape,
            model_version: forecast.model_version,
          });
        } catch (accError) {
          console.error(`Accuracy log error for ${forecast.product_name}:`, accError);
        }
      }
    }

    return new Response(JSON.stringify({
      message: 'Demand forecast completed',
      forecasts: results.length,
      accuracy_checks: oldForecasts?.length || 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Demand forecast error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
