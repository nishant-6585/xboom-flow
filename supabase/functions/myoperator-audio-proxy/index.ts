import { createClient } from 'npm:@supabase/supabase-js@2';

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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get recording URL from query params
    const url = new URL(req.url);
    const recordingUrl = url.searchParams.get('url');
    if (!recordingUrl) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch MyOperator config for auth headers
    const { data: config } = await supabase
      .from('myoperator_config')
      .select('api_token, x_api_key, company_id')
      .limit(1)
      .maybeSingle();

    // Build headers for MyOperator API
    const fetchHeaders: Record<string, string> = {};
    if (config?.api_token) {
      fetchHeaders['Authorization'] = `Bearer ${config.api_token}`;
    }
    if (config?.x_api_key) {
      fetchHeaders['x-api-key'] = config.x_api_key;
    }

    // Fetch the audio file from MyOperator
    const audioResponse = await fetch(recordingUrl, { headers: fetchHeaders });
    
    if (!audioResponse.ok) {
      // Try without auth headers as fallback (some URLs may be public)
      const fallbackResponse = await fetch(recordingUrl);
      if (!fallbackResponse.ok) {
        return new Response(JSON.stringify({ error: 'Failed to fetch recording', status: fallbackResponse.status }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const fallbackBody = await fallbackResponse.arrayBuffer();
      return new Response(fallbackBody, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': fallbackResponse.headers.get('Content-Type') || 'audio/mpeg',
          'Content-Length': String(fallbackBody.byteLength),
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    const audioBody = await audioResponse.arrayBuffer();
    return new Response(audioBody, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': audioResponse.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Length': String(audioBody.byteLength),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    console.error('Audio proxy error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
