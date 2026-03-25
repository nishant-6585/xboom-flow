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

    // Get file parameter
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
      .select('api_token, x_api_key, secret_key')
      .limit(1)
      .maybeSingle();

    if (configError || !config) {
      return new Response(JSON.stringify({ error: 'MyOperator not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try multiple auth strategies since MyOperator has different token types
    const tokens = [config.api_token, config.x_api_key, config.secret_key].filter(Boolean);
    
    for (const tryToken of tokens) {
      // Strategy 1: token in query string (documented approach)
      const apiUrl = `https://developers.myoperator.co/recordings/link?token=${encodeURIComponent(tryToken)}&file=${encodeURIComponent(file)}`;
      console.log('Trying recordings API with token prefix:', tryToken.substring(0, 6) + '...');

      const apiResponse = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'X-API-Key': config.x_api_key || '',
          'Accept': 'application/json,audio/*,*/*',
          'User-Agent': 'Mozilla/5.0',
        },
      });

      const contentType = apiResponse.headers.get('content-type') || '';
      console.log('Response status:', apiResponse.status, 'content-type:', contentType);

      // If we got audio back directly, stream it
      if (contentType.includes('audio') || contentType.includes('octet-stream')) {
        console.log('Got audio stream directly');
        return new Response(apiResponse.body, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': contentType || 'audio/mpeg',
            'Cache-Control': 'private, max-age=3600',
          },
        });
      }

      // Parse JSON response
      if (contentType.includes('json') || contentType.includes('text')) {
        const data = await apiResponse.json().catch(() => null);
        console.log('API response:', JSON.stringify(data));

        if (data?.status === 'error') {
          // This token didn't work, try next one
          console.warn('Token failed:', data.message);
          continue;
        }

        // Look for recording URL in various response shapes
        const recordingUrl = data?.link || data?.url || data?.recording_url || data?.data?.link || data?.data?.url;
        if (recordingUrl) {
          return new Response(JSON.stringify({ recording_url: recordingUrl }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // All tokens failed — fall back to direct URL fetch with browser headers
    console.log('All API tokens failed, trying direct URL fetch as fallback');
    const directUrl = `https://app.myoperator.com/audio/${file}`;
    const directResponse = await fetch(directUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'audio/mpeg,audio/*,*/*',
      },
    });

    const directContentType = directResponse.headers.get('content-type') || '';
    console.log('Direct fetch status:', directResponse.status, 'content-type:', directContentType);

    if (directContentType.includes('audio') || directContentType.includes('octet-stream')) {
      return new Response(directResponse.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': directContentType || 'audio/mpeg',
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    // Nothing worked
    return new Response(JSON.stringify({ 
      error: 'Recording not available - MyOperator credentials may need to be updated',
      hint: 'Please verify your API Token in Admin → MyOperator Settings'
    }), {
      status: 404,
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
