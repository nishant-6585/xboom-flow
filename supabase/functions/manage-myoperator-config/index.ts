import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is authenticated and is admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claims.claims.sub as string;

    // Verify admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'save') {
      const { api_token, secret_key, x_api_key, company_id } = body;

      if (!api_token || !x_api_key || !company_id) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if config exists
      const { data: existing } = await supabase
        .from('myoperator_config')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('myoperator_config')
          .update({ api_token, secret_key: secret_key || '', x_api_key, company_id, is_connected: true })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('myoperator_config')
          .insert({ api_token, secret_key: secret_key || '', x_api_key, company_id, is_connected: true });
        if (error) throw error;
      }

      // Audit log
      await supabase.from('security_audit_log').insert({
        user_id: userId,
        user_name: claims.claims.email || 'Admin',
        action: 'MYOPERATOR_CONFIG_UPDATED',
        details: { company_id },
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'disconnect') {
      const { data: existing } = await supabase
        .from('myoperator_config')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('myoperator_config')
          .update({ is_connected: false, api_token: '', secret_key: '', x_api_key: '', company_id: '' })
          .eq('id', existing.id);
        if (error) throw error;
      }

      await supabase.from('security_audit_log').insert({
        user_id: userId,
        user_name: claims.claims.email || 'Admin',
        action: 'MYOPERATOR_DISCONNECTED',
        details: {},
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'status') {
      const { data: config } = await supabase
        .from('myoperator_config')
        .select('id, is_connected, company_id, created_at, updated_at')
        .limit(1)
        .maybeSingle();

      return new Response(JSON.stringify({ config }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'test') {
      const { api_token, x_api_key, company_id } = body;
      if (!api_token || !x_api_key || !company_id) {
        return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Test actual MyOperator API connectivity
      try {
        const now = Math.floor(Date.now() / 1000);
        const from = now - 60;
        const testUrl = `https://developers.myoperator.co/search/logs?token=${encodeURIComponent(api_token)}&from=${from}&to=${now}`;
        const testResponse = await fetch(testUrl, {
          method: 'GET',
          headers: { 'x-api-key': x_api_key, 'Content-Type': 'application/json' },
        });

        if (testResponse.ok) {
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          return new Response(JSON.stringify({ success: false, error: `API returned ${testResponse.status}` }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch {
        return new Response(JSON.stringify({ success: false, error: 'Failed to reach MyOperator API' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Config management error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
