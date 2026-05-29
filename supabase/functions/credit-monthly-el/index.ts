import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorizedCron } from "../_shared/cron-auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Require cron secret OR an authenticated admin JWT
    const cronOk = await isAuthorizedCron(req);
    if (!cronOk) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: authError } = await userClient.auth.getUser();
      if (authError || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: isAdmin } = await supabase.rpc('has_role', {
        _user_id: userData.user.id,
        _role: 'admin',
      });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Determine which month to credit (current month)
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const year = now.getFullYear();

    console.log(`Crediting EL for month: ${month}/${year}`);

    const { data, error } = await supabase.rpc('credit_monthly_el', {
      p_month: month,
      p_year: year,
      p_credit_amount: 1.75,
    });

    if (error) {
      console.error('Error crediting EL:', error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('EL credit result:', data);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
