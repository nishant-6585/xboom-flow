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

    // Get recording URL from query params
    const reqUrl = new URL(req.url);
    const recordingUrl = reqUrl.searchParams.get('url');
    if (!recordingUrl) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Clean up the URL
    const cleanUrl = recordingUrl.replace(/\\\//g, '/').trim();

    // SSRF guard: only allow https + known MyOperator hosts
    const ALLOWED_HOSTS = new Set([
      'app.myoperator.com',
      'recordings.myoperator.co',
      'cdn.myoperator.co',
      's3.amazonaws.com',
      'myoperator.s3.amazonaws.com',
    ]);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(cleanUrl);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (parsedUrl.protocol !== 'https:') {
      return new Response(JSON.stringify({ error: 'Only https URLs are allowed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const hostAllowed =
      ALLOWED_HOSTS.has(parsedUrl.hostname) ||
      parsedUrl.hostname.endsWith('.myoperator.co') ||
      parsedUrl.hostname.endsWith('.myoperator.com') ||
      parsedUrl.hostname.endsWith('.amazonaws.com');
    if (!hostAllowed) {
      return new Response(JSON.stringify({ error: 'URL host not allowed' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log('Fetching recording host:', parsedUrl.hostname);

    // Fetch with browser-like headers and follow redirects
    const response = await fetch(cleanUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'audio/mpeg,audio/*,*/*',
      },
    });

    const finalUrl = response.url;
    console.log('Final resolved URL:', finalUrl);
    console.log('Status:', response.status);
    console.log('Headers:', JSON.stringify(Object.fromEntries(response.headers)));

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Recording not accessible', status: response.status, url: cleanUrl }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('audio')) {
      console.warn('Non-audio content-type:', contentType);
    }

    // Stream the response body directly instead of buffering
    return new Response(response.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType || 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600',
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
