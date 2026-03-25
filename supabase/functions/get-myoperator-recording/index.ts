import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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

    // Get file parameter (the recording filename from _fu URL path)
    const reqUrl = new URL(req.url);
    const file = reqUrl.searchParams.get('file');
    if (!file) {
      return new Response(JSON.stringify({ error: 'Missing file parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch MyOperator config
    const { data: config, error: configError } = await supabase
      .from('myoperator_config')
      .select('api_token, x_api_key')
      .limit(1)
      .maybeSingle();

    if (configError || !config?.api_token) {
      return new Response(JSON.stringify({ error: 'MyOperator not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call MyOperator Recordings Link API
    const apiUrl = `https://developers.myoperator.co/recordings/link?token=${encodeURIComponent(config.api_token)}&file=${encodeURIComponent(file)}`;
    console.log('Calling MyOperator recordings API for file:', file);

    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-API-Key': config.x_api_key || '',
        'Accept': 'application/json',
      },
    });

    console.log('MyOperator API status:', apiResponse.status);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text().catch(() => '');
      console.error('MyOperator API error:', apiResponse.status, errorText);
      return new Response(JSON.stringify({ error: 'Failed to fetch recording link', status: apiResponse.status }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contentType = apiResponse.headers.get('content-type') || '';

    // If API returns JSON with a recording URL
    if (contentType.includes('application/json')) {
      const data = await apiResponse.json();
      console.log('MyOperator API response keys:', Object.keys(data));

      // The API may return a direct URL or a link object
      const recordingUrl = data?.link || data?.url || data?.recording_url || data?.data?.link || data?.data?.url;

      if (recordingUrl) {
        return new Response(JSON.stringify({ recording_url: recordingUrl }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // If no URL found in response, return the raw response for debugging
      console.warn('No recording URL found in API response:', JSON.stringify(data));
      return new Response(JSON.stringify({ error: 'Recording not available', debug: data }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If API returns audio directly (stream it through)
    if (contentType.includes('audio') || contentType.includes('octet-stream')) {
      console.log('API returned audio directly, streaming through');
      return new Response(apiResponse.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': contentType || 'audio/mpeg',
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    // Unexpected response type
    const bodyText = await apiResponse.text().catch(() => '');
    console.warn('Unexpected response type:', contentType, bodyText.substring(0, 200));
    return new Response(JSON.stringify({ error: 'Unexpected API response', contentType }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Recording fetch error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
