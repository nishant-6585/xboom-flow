import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function extractNextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(',');
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const storeDomain = Deno.env.get('SHOPIFY_STORE_DOMAIN');
    const adminToken = Deno.env.get('SHOPIFY_ADMIN_API_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!storeDomain || !adminToken) {
      return new Response(JSON.stringify({ error: 'Missing Shopify credentials' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    let totalFetched = 0;
    let totalInserted = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    // Start with first page
    let nextUrl: string | null = `https://${storeDomain}/admin/api/2025-01/orders.json?limit=250&status=any`;

    while (nextUrl) {
      console.log(`Fetching: ${nextUrl}`);

      const response = await fetch(nextUrl, {
        headers: {
          'X-Shopify-Access-Token': adminToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(JSON.stringify({
          error: 'Shopify API error',
          status: response.status,
          details: errorText,
          progress: { totalFetched, totalInserted, totalSkipped },
        }), {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const data = await response.json();
      const orders = data.orders || [];
      totalFetched += orders.length;
      console.log(`Page returned ${orders.length} orders (total so far: ${totalFetched})`);

      // Build raw rows
      const rows = orders.map((order: Record<string, unknown>) => ({
        shop_domain: storeDomain,
        order_id: String(order.id),
        payload: order,
        processing_status: 'pending',
        retry_count: 0,
        webhook_topic: 'backfill',
      }));

      if (rows.length > 0) {
        // Batch upsert with ON CONFLICT DO NOTHING
        const { data: upsertData, error: upsertError } = await serviceClient
          .from('shopify_orders_raw')
          .upsert(rows, {
            onConflict: 'shop_domain,order_id',
            ignoreDuplicates: true,
          })
          .select('id');

        if (upsertError) {
          console.error('Upsert error:', upsertError.message);
          errors.push(upsertError.message);
          // Count all as skipped on error
          totalSkipped += rows.length;
        } else {
          const inserted = upsertData?.length ?? 0;
          totalInserted += inserted;
          totalSkipped += rows.length - inserted;
        }
      }

      // Parse Link header for cursor-based pagination
      const linkHeader = response.headers.get('Link');
      nextUrl = extractNextPageUrl(linkHeader);

      if (nextUrl) {
        console.log('Next page cursor found, continuing...');
      } else {
        console.log('No more pages.');
      }
    }

    const summary = {
      success: true,
      total_fetched: totalFetched,
      total_inserted: totalInserted,
      total_skipped: totalSkipped,
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log(`Backfill complete: ${JSON.stringify(summary)}`);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
