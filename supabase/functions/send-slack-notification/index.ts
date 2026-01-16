import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SlackPayload {
  type: 'new_order' | 'hot_lead' | 'payment_reminder' | 'status_change';
  data: Record<string, unknown>;
}

const formatCurrency = (amount: number | null | undefined): string => {
  if (!amount) return '₹0';
  return `₹${amount.toLocaleString('en-IN')}`;
};

const getOrderBlocks = (data: Record<string, unknown>) => {
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🛒 New Order Created",
          emoji: true
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Order Number:*\n${data.order_number || 'N/A'}` },
          { type: "mrkdwn", text: `*Customer:*\n${data.customer_name} (${data.customer_company})` },
          { type: "mrkdwn", text: `*Product:*\n${data.product_name}` },
          { type: "mrkdwn", text: `*Quantity:*\n${data.quantity}` },
          { type: "mrkdwn", text: `*Amount:*\n${formatCurrency(data.total_sales_amount as number)}` },
          { type: "mrkdwn", text: `*Sales Person:*\n${data.sales_person_name}` }
        ]
      },
      { type: "divider" }
    ]
  };
};

const getHotLeadBlocks = (data: Record<string, unknown>) => {
  const isMegaDeal = data.is_mega_deal === true;
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: isMegaDeal ? "🌟 Mega Deal Alert!" : "🔥 Hot Lead Alert!",
          emoji: true
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Customer:*\n${data.customer_name}` },
          { type: "mrkdwn", text: `*Company:*\n${data.customer_company}` },
          { type: "mrkdwn", text: `*Product:*\n${data.product_name}` },
          { type: "mrkdwn", text: `*Quantity:*\n${data.quantity}` },
          { type: "mrkdwn", text: `*Expected Value:*\n${formatCurrency(data.expected_price as number)}` },
          { type: "mrkdwn", text: `*Sales Person:*\n${data.sales_person_name}` }
        ]
      },
      { type: "divider" }
    ]
  };
};

const getPaymentReminderBlocks = (data: Record<string, unknown>) => {
  const isOverdue = data.is_overdue === true;
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: isOverdue ? "⚠️ Payment Overdue!" : "💰 Payment Reminder",
          emoji: true
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Order:*\n${data.order_number || 'N/A'}` },
          { type: "mrkdwn", text: `*Customer:*\n${data.customer_name} (${data.customer_company})` },
          { type: "mrkdwn", text: `*Total Amount:*\n${formatCurrency(data.total_amount as number)}` },
          { type: "mrkdwn", text: `*Paid:*\n${formatCurrency(data.amount_paid as number)}` },
          { type: "mrkdwn", text: `*Balance:*\n${formatCurrency(data.balance as number)}` },
          { type: "mrkdwn", text: `*Due Date:*\n${data.due_date || 'N/A'}` }
        ]
      },
      { type: "divider" }
    ]
  };
};

const getStatusChangeBlocks = (data: Record<string, unknown>) => {
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "📦 Order Status Updated",
          emoji: true
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Order:*\n${data.order_number || 'N/A'}` },
          { type: "mrkdwn", text: `*Customer:*\n${data.customer_name}` },
          { type: "mrkdwn", text: `*Old Status:*\n${data.old_status || 'N/A'}` },
          { type: "mrkdwn", text: `*New Status:*\n${data.new_status}` }
        ]
      },
      { type: "divider" }
    ]
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: SlackPayload = await req.json();
    const { type, data } = payload;

    console.log('Received Slack notification request:', { type, data });

    // Fetch Slack settings
    const { data: settings, error: settingsError } = await supabase
      .from('slack_settings')
      .select('*')
      .limit(1)
      .single();

    if (settingsError) {
      console.error('Error fetching Slack settings:', settingsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch Slack settings' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Check if Slack is enabled
    if (!settings?.is_enabled || !settings?.webhook_url) {
      console.log('Slack notifications are disabled or webhook not configured');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Slack disabled or not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this notification type is enabled
    const notificationTypeMap: Record<string, keyof typeof settings> = {
      'new_order': 'notify_new_orders',
      'hot_lead': 'notify_hot_leads',
      'payment_reminder': 'notify_payment_reminders',
      'status_change': 'notify_status_changes'
    };

    const settingKey = notificationTypeMap[type];
    if (settingKey && !settings[settingKey]) {
      console.log(`Notification type ${type} is disabled`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: `${type} notifications disabled` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format message based on type
    let slackMessage;
    switch (type) {
      case 'new_order':
        slackMessage = getOrderBlocks(data);
        break;
      case 'hot_lead':
        slackMessage = getHotLeadBlocks(data);
        break;
      case 'payment_reminder':
        slackMessage = getPaymentReminderBlocks(data);
        break;
      case 'status_change':
        slackMessage = getStatusChangeBlocks(data);
        break;
      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Unknown notification type' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }

    // Send to Slack webhook
    const slackResponse = await fetch(settings.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage)
    });

    if (!slackResponse.ok) {
      const errorText = await slackResponse.text();
      console.error('Slack webhook error:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'Slack webhook failed', details: errorText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log('Slack notification sent successfully');
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-slack-notification:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
