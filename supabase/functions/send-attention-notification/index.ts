import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NOTIFY_EMAIL = 'vishal.saurav@xboom.in';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { customer_name, source_type, product_name, marked_by_name, company, phone_number, email } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
            <p><strong>Contact:</strong> ${customer_name}</p>
            ${company ? `<p><strong>Company:</strong> ${company}</p>` : ''}
            ${phone_number ? `<p><strong>Phone:</strong> ${phone_number}</p>` : ''}
            ${email ? `<p><strong>Email:</strong> ${email}</p>` : ''}
            ${product_name ? `<p><strong>Product:</strong> ${product_name}</p>` : ''}
            <p><strong>Source:</strong> ${source_type}</p>
            <p><strong>Flagged by:</strong> ${marked_by_name}</p>
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
          subject: `🚨 Attention: ${customer_name}${company ? ` - ${company}` : ''} [${source_type}]`,
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
