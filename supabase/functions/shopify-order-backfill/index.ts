import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const storeDomain = Deno.env.get('SHOPIFY_STORE_DOMAIN');
    const adminToken = Deno.env.get('SHOPIFY_ADMIN_API_TOKEN');

    if (!storeDomain || !adminToken) {
      return new Response(JSON.stringify({ error: 'Missing Shopify credentials' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = `https://${storeDomain}/admin/api/2024-01/orders.json?limit=10&status=any`;
    console.log(`Fetching orders from: ${storeDomain}`);

    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': adminToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Shopify API error: ${response.status} - ${errorText}`);
      return new Response(JSON.stringify({ error: 'Shopify API error', status: response.status, details: errorText }), {
        status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const orders = data.orders || [];

    for (const order of orders) {
      console.log(JSON.stringify({
        order_id: order.id,
        name: order.name,
        email: order.email,
        total_price: order.total_price,
        created_at: order.created_at,
      }));
    }

    console.log(`Total orders fetched: ${orders.length}`);

    return new Response(JSON.stringify({ success: true, count: orders.length, orders }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
