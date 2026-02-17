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
      return new Response(JSON.stringify({
        error: 'Missing Shopify credentials',
        hasDomain: !!storeDomain,
        hasToken: !!adminToken,
      }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try multiple endpoints to diagnose
    const endpoints = [
      `https://${storeDomain}/admin/api/2024-10/shop.json`,
      `https://${storeDomain}/admin/api/2024-10/orders.json?limit=1&status=any`,
      `https://${storeDomain}/admin/api/2025-01/orders.json?limit=1&status=any`,
    ];
    const results: Record<string, any> = {};
    
    for (const apiUrl of endpoints) {
      console.log(`DIAGNOSTIC — Trying: ${apiUrl}`);
      const resp = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': adminToken,
          'Content-Type': 'application/json',
        },
      });
      const body = await resp.text();
      results[apiUrl] = { status: resp.status, body: body.substring(0, 300) };
      console.log(`DIAGNOSTIC — ${apiUrl} → ${resp.status}: ${body.substring(0, 200)}`);
    }
    console.log(`DIAGNOSTIC — Domain: ${storeDomain}`);
    console.log(`DIAGNOSTIC — Token prefix: ${adminToken.substring(0, 8)}****`);

    return new Response(JSON.stringify({
      diagnostic: true,
      domainUsed: storeDomain,
      tokenPrefix: adminToken.substring(0, 8) + '****',
      results,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message,
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
