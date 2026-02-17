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

    const apiUrl = `https://${storeDomain}/admin/api/2025-01/orders.json?limit=10&status=any`;
    console.log(`DIAGNOSTIC — URL: ${apiUrl}`);
    console.log(`DIAGNOSTIC — Domain: ${storeDomain}`);
    console.log(`DIAGNOSTIC — Token prefix: ${adminToken.substring(0, 8)}****`);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': adminToken,
        'Content-Type': 'application/json',
      },
    });

    const responseBody = await response.text();
    console.log(`DIAGNOSTIC — Status: ${response.status}`);
    console.log(`DIAGNOSTIC — Body: ${responseBody.substring(0, 500)}`);

    return new Response(JSON.stringify({
      diagnostic: true,
      urlCalled: apiUrl,
      domainUsed: storeDomain,
      tokenPrefix: adminToken.substring(0, 8) + '****',
      responseStatus: response.status,
      responseBody: responseBody.substring(0, 1000),
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
