import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail as sendMailSeam } from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NOTIFY_EMAIL = 'vishal.saurav@xboom.in';

const INTERNAL_ROLES = ['admin', 'sales', 'sales_manager', 'hr', 'support', 'marketing', 'finance', 'it', 'supply_chain'];

const sanitize = (s: unknown): string => String(s ?? '').slice(0, 200);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify caller has an internal role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    const hasInternalRole = (roles || []).some((r: any) => INTERNAL_ROLES.includes(r.role));
    if (!hasInternalRole) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const customer_name = sanitize(body.customer_name);
    const source_type = sanitize(body.source_type);
    const product_name = sanitize(body.product_name);
    const marked_by_name = sanitize(body.marked_by_name);
    const company = sanitize(body.company);
    const phone_number = sanitize(body.phone_number);
    const email = sanitize(body.email);

    // Create a notification record
    await supabase.from('notifications').insert({
      type: 'attention',
      title: `🚨 Attention Required: ${customer_name}`,
      message: `${marked_by_name} flagged ${customer_name}${company ? ` (${company})` : ''} from ${source_type} for attention.${product_name ? ` Product: ${product_name}` : ''}`,
      target_role: 'admin',
    });

    // Send email notification through the shared seam.
    {
      // Stable idempotency: (customer, source, date, marker) — one alert
      // per distinct flag per day. Retries collapse.
      const day = new Date().toISOString().slice(0, 10);
      const idempotencyKey =
        `attention-notification:${day}:${source_type}:${customer_name}:${marked_by_name}`.slice(0, 240);
      await sendMailSeam({
        provider: 'platform',
        to: NOTIFY_EMAIL,
        subject: '',
        html: '',
        templateName: 'attention-notification',
        templateData: {
          customer_name,
          company,
          phone_number,
          email,
          product_name,
          source_type,
          marked_by_name,
        },
        idempotencyKey,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error sending attention notification:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
