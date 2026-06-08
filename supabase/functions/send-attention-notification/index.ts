import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NOTIFY_EMAIL = 'vishal.saurav@xboom.in';

const INTERNAL_ROLES = ['admin', 'sales', 'sales_manager', 'hr', 'support', 'marketing', 'finance', 'it', 'supply_chain'];

const escapeHtml = (s: unknown): string =>
  String(s ?? '')
    .slice(0, 200)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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

    // Try to send email notification via Resend if API key exists
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey) {
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #dc2626; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0;">🚨 Attention Required</h2>
          </div>
          <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
            <p><strong>Contact:</strong> ${escapeHtml(customer_name)}</p>
            ${company ? `<p><strong>Company:</strong> ${escapeHtml(company)}</p>` : ''}
            ${phone_number ? `<p><strong>Phone:</strong> ${escapeHtml(phone_number)}</p>` : ''}
            ${email ? `<p><strong>Email:</strong> ${escapeHtml(email)}</p>` : ''}
            ${product_name ? `<p><strong>Product:</strong> ${escapeHtml(product_name)}</p>` : ''}
            <p><strong>Source:</strong> ${escapeHtml(source_type)}</p>
            <p><strong>Flagged by:</strong> ${escapeHtml(marked_by_name)}</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <p style="color: #6b7280; font-size: 14px;">This contact has been marked for immediate attention in XBoom Sales Arena.</p>
          </div>
        </div>
      `;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'XBoom Alerts <alerts@xboom.in>',
          to: [NOTIFY_EMAIL],
          subject: `🚨 Attention: ${customer_name}${company ? ` - ${company}` : ''} [${source_type}]`.slice(0, 200),
          html: emailBody,
        }),
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
