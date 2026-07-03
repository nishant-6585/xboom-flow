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

    // Restrict to roles that legitimately need call recordings
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    const allowed = new Set(['admin', 'sales', 'sales_manager', 'hr']);
    if (!roles?.some((r: { role: string }) => allowed.has(r.role))) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get file parameter (this is the _fn value from MyOperator payload)
    const reqUrl = new URL(req.url);
    const file = reqUrl.searchParams.get('file');
    if (!file) {
      return new Response(JSON.stringify({ error: 'Missing file parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Strict allowlist: only safe filename characters to prevent PostgREST filter injection
    if (!/^[A-Za-z0-9._\-]+$/.test(file) || file.length > 256) {
      return new Response(JSON.stringify({ error: 'Invalid file parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check cache first - look for a cached recording URL that's less than 20 hours old
    let { data: cachedLog } = await supabase
      .from('call_logs')
      .select('id, recording_stream_url, recording_fetched_at')
      .filter('raw_payload->>_fn', 'eq', file)
      .not('recording_stream_url', 'is', null)
      .limit(1)
      .maybeSingle();

    if (!cachedLog) {
      const { data } = await supabase
        .from('call_logs')
        .select('id, recording_stream_url, recording_fetched_at')
        .filter('raw_payload->>filename', 'eq', file)
        .not('recording_stream_url', 'is', null)
        .limit(1)
        .maybeSingle();
      cachedLog = data;
    }

    if (cachedLog?.recording_stream_url && cachedLog?.recording_fetched_at) {
      const fetchedAt = new Date(cachedLog.recording_fetched_at).getTime();
      const now = Date.now();
      const twentyHours = 20 * 60 * 60 * 1000;
      if (now - fetchedAt < twentyHours) {
        console.log('Returning cached recording URL');
        return new Response(JSON.stringify({ recording_url: cachedLog.recording_stream_url }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Fetch MyOperator config
    const { data: config, error: configError } = await supabase
      .from('myoperator_config')
      .select('api_token, x_api_key, secret_key')
      .limit(1)
      .maybeSingle();

    if (configError || !config) {
      return new Response(JSON.stringify({ available: false, error: 'MyOperator not configured' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call MyOperator recordings/link API
    // Try api_token first (primary credential for this endpoint)
    const apiToken = config.api_token;
    if (!apiToken) {
      return new Response(JSON.stringify({ available: false, error: 'API token not configured' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiUrl = `https://developers.myoperator.co/recordings/link?token=${encodeURIComponent(apiToken)}&file=${encodeURIComponent(file)}`;
    console.log('Calling MyOperator recordings/link API for file:', file.substring(0, 20) + '...');

    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const responseText = await apiResponse.text();
    console.log('MyOperator API status:', apiResponse.status, 'response:', responseText.substring(0, 200));

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('Non-JSON response from MyOperator API');
      return new Response(JSON.stringify({ available: false, error: 'Invalid API response' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for API error
    if (data.status === 'error') {
      console.error('MyOperator API error:', data.message);
      return new Response(JSON.stringify({
        available: false,
        error: 'Recording not available',
        debug: data,
        hint: 'Please verify your API Token in Admin → MyOperator Settings',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract recording URL from response
    const recordingUrl = data.url || data.link || data.recording_url || data.data?.url || data.data?.link;

    if (recordingUrl) {
      // Cache the URL in the call_logs table
      await supabase
        .from('call_logs')
        .update({
          recording_stream_url: recordingUrl,
          recording_fetched_at: new Date().toISOString(),
        })
        .filter('raw_payload->>_fn', 'eq', file)
        .is('recording_stream_url', null);

      await supabase
        .from('call_logs')
        .update({
          recording_stream_url: recordingUrl,
          recording_fetched_at: new Date().toISOString(),
        })
        .filter('raw_payload->>filename', 'eq', file)
        .is('recording_stream_url', null);

      return new Response(JSON.stringify({ recording_url: recordingUrl }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // No URL found in response
    return new Response(JSON.stringify({
      available: false,
      error: 'No recording URL in API response',
      debug: data,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Recording fetch error:', err);
    return new Response(JSON.stringify({
      available: false,
      error: 'Recording not available',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
