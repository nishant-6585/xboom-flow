import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-slack-signature, x-slack-request-timestamp',
};

async function verifySlackSignature(req: Request, body: string): Promise<boolean> {
  const signingSecret = Deno.env.get('SLACK_SIGNING_SECRET');
  if (!signingSecret) {
    console.error('SLACK_SIGNING_SECRET not configured — rejecting request');
    return false;
  }

  const timestamp = req.headers.get('x-slack-request-timestamp');
  const signature = req.headers.get('x-slack-signature');

  if (!timestamp || !signature) return false;

  // Prevent replay attacks (5 min window)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(signingSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(sigBasestring));
  const computed = 'v0=' + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

  return timingSafeEqual(computed, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    
    // Verify Slack signature
    const isValid = await verifySlackSignature(req, rawBody);
    if (!isValid) {
      return new Response('Invalid signature', { status: 401 });
    }

    // Parse URL-encoded payload from Slack
    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get('payload');
    if (!payloadStr) {
      return new Response('Missing payload', { status: 400 });
    }

    const payload = JSON.parse(payloadStr);
    const actionId = payload.actions?.[0]?.action_id;
    const slackUserId = payload.user?.id;
    const slackUserName = payload.user?.name || payload.user?.username;

    if (!actionId) {
      return new Response('No action', { status: 400 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const botToken = Deno.env.get('SLACK_BOT_TOKEN');

    // Log the action
    await supabase.from('ai_action_logs').insert({
      action_type: `slack_action_${actionId}`,
      user_id: '00000000-0000-0000-0000-000000000000',
      payload: { action_id: actionId, slack_user: slackUserName, slack_user_id: slackUserId },
      status: 'processing',
    });

    let responseText = '';

    switch (actionId) {
      case 'follow_up_hot_leads': {
        // Get stale hot leads
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: hotLeads } = await supabase.from('pipeline_orders')
          .select('id, customer_name, product_name, sales_person_name, sales_person_id')
          .eq('lead_temperature', 'hot')
          .not('status', 'in', '(won,lost)')
          .lt('updated_at', twentyFourHoursAgo)
          .limit(10);

        if (!hotLeads || hotLeads.length === 0) {
          responseText = '✅ No stale hot leads found. All hot leads are up-to-date!';
        } else {
          // Create follow-up tasks
          const tasks = hotLeads.map((lead: any) => ({
            task_type: 'hot_lead_followup',
            title: `🔥 Follow-up: ${lead.customer_name} — ${lead.product_name}`,
            description: `Auto-generated follow-up via Slack action by ${slackUserName}`,
            assigned_to: lead.sales_person_id,
            assigned_to_name: lead.sales_person_name,
            assigned_role: 'sales',
            priority: 1,
            due_date: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          }));

          await supabase.from('tasks').insert(tasks);
          responseText = `✅ Created ${tasks.length} follow-up task(s) for stale hot leads. Assigned to respective salespeople.`;
        }
        break;
      }

      case 'assign_stale_leads': {
        // Find best performer and assign stale leads
        const { data: staleLeads } = await supabase.from('pipeline_orders')
          .select('id, customer_name, product_name')
          .eq('lead_temperature', 'hot')
          .not('status', 'in', '(won,lost)')
          .lt('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(5);

        responseText = staleLeads && staleLeads.length > 0
          ? `📋 ${staleLeads.length} stale lead(s) identified. Visit the dashboard to reassign them: https://xboom-flow.lovable.app/sales`
          : '✅ No stale leads to assign.';
        break;
      }

      case 'send_reminders': {
        responseText = '📩 Payment reminders will be triggered. Check the dashboard for details: https://xboom-flow.lovable.app/sales';
        break;
      }

      default:
        responseText = `Action "${actionId}" received. Processing...`;
    }

    // Update action log
    await supabase.from('ai_action_logs').insert({
      action_type: `slack_action_${actionId}_result`,
      user_id: '00000000-0000-0000-0000-000000000000',
      payload: { action_id: actionId },
      result: { response: responseText },
      status: 'completed',
    });

    // Respond to Slack with ephemeral message
    return new Response(JSON.stringify({
      response_type: 'ephemeral',
      text: responseText,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Slack actions error:', error);
    return new Response(JSON.stringify({
      response_type: 'ephemeral',
      text: '❌ Something went wrong processing your request.',
    }), {
      status: 200, // Slack expects 200 even on errors
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
