import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SlackPayload {
  type: 'new_order' | 'hot_lead' | 'payment_reminder' | 'status_change' | 'new_enquiry' | 'new_procurement' | 'new_supplier' | 'new_pipeline' | 'test' | 'test_channel';
  data: Record<string, unknown>;
}

const formatCurrency = (amount: number | null | undefined): string => {
  if (!amount) return '₹0';
  return `₹${amount.toLocaleString('en-IN')}`;
};

const getOrderBlocks = (data: Record<string, unknown>) => {
  const isWebsiteOrder = data.is_website_order === true;
  const orderType = isWebsiteOrder ? 'Website Order' : 'Sales Order';
  
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🛒 New ${orderType} Received!`,
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `A new order has been placed by *${data.customer_name}* from *${data.customer_company}*.`
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*📋 Order Number:*\n\`${data.order_number || 'Pending'}\`` },
          { type: "mrkdwn", text: `*👤 Customer:*\n${data.customer_name}` },
          { type: "mrkdwn", text: `*🏢 Company:*\n${data.customer_company}` },
          { type: "mrkdwn", text: `*📦 Product:*\n${data.product_name}` },
          { type: "mrkdwn", text: `*🔢 Quantity:*\n${data.quantity} units` },
          { type: "mrkdwn", text: `*💰 Order Value:*\n${formatCurrency(data.total_sales_amount as number)}` }
        ]
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `🧑‍💼 *Sales:* ${data.sales_person_name || 'Website'} • 📅 ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` }
        ]
      },
      { type: "divider" }
    ]
  };
};

const getEnquiryBlocks = (data: Record<string, unknown>) => {
  const isHot = data.lead_temperature === 'hot';
  const isMegaDeal = data.is_mega_deal === true;
  const urgencyEmoji = data.urgency === 'high' ? '🚨' : data.urgency === 'medium' ? '⚡' : '📝';
  
  let headerText = "📩 New Enquiry Received";
  let contextText = "A new product enquiry needs attention.";
  
  if (isMegaDeal) {
    headerText = "🌟 MEGA DEAL Enquiry!";
    contextText = "🎯 High-value opportunity! This could be a significant deal - prioritize follow-up.";
  } else if (isHot) {
    headerText = "🔥 HOT LEAD Enquiry!";
    contextText = "⚡ High conversion potential! Customer is ready to buy - respond within 2 hours.";
  }
  
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: headerText,
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: contextText
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*👤 Customer:*\n${data.customer_name}` },
          { type: "mrkdwn", text: `*🏢 Company:*\n${data.customer_company}` },
          { type: "mrkdwn", text: `*📦 Product:*\n${data.product_name}` },
          { type: "mrkdwn", text: `*🔢 Quantity:*\n${data.quantity} units` },
          { type: "mrkdwn", text: `*${urgencyEmoji} Urgency:*\n${(data.urgency as string || 'N/A').toUpperCase()}` },
          { type: "mrkdwn", text: `*📂 Category:*\n${data.product_category || 'N/A'}` }
        ]
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `🧑‍💼 *Assigned to:* ${data.sales_person_name} • 📍 *State:* ${data.customer_state || 'N/A'}` }
        ]
      },
      { type: "divider" }
    ]
  };
};

const getPipelineBlocks = (data: Record<string, unknown>) => {
  const isHot = data.lead_temperature === 'hot';
  const isMegaDeal = data.is_mega_deal === true;
  const probability = data.probability as number || 0;
  
  let headerText = "📊 New Lead Added to Pipeline";
  let statusContext = "";
  
  if (isMegaDeal) {
    headerText = "🌟 MEGA DEAL Added to Pipeline!";
    statusContext = "💎 Major opportunity identified - management review recommended.";
  } else if (isHot) {
    headerText = "🔥 Hot Lead in Pipeline!";
    statusContext = "🎯 High-priority lead - expected to close soon.";
  }
  
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: headerText,
          emoji: true
        }
      },
      ...(statusContext ? [{
        type: "section",
        text: {
          type: "mrkdwn",
          text: statusContext
        }
      }] : []),
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*👤 Customer:*\n${data.customer_name}` },
          { type: "mrkdwn", text: `*🏢 Company:*\n${data.customer_company}` },
          { type: "mrkdwn", text: `*📦 Product:*\n${data.product_name}` },
          { type: "mrkdwn", text: `*🔢 Quantity:*\n${data.quantity} units` },
          { type: "mrkdwn", text: `*💰 Expected Value:*\n${formatCurrency(data.expected_price as number)}` },
          { type: "mrkdwn", text: `*📈 Win Probability:*\n${probability}%` }
        ]
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `🧑‍💼 *Sales:* ${data.sales_person_name} • 📅 *Expected Close:* ${data.expected_closure_date || 'TBD'} • 📍 *Status:* ${data.status || 'New'}` }
        ]
      },
      { type: "divider" }
    ]
  };
};

const getProcurementBlocks = (data: Record<string, unknown>) => {
  const paymentStatus = data.payment_status as string || 'pending';
  const paymentEmoji = paymentStatus === 'paid' ? '✅' : paymentStatus === 'partial' ? '🔄' : '⏳';
  
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "📦 New Procurement Order Created",
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `A procurement order has been raised for *${data.product_name}* from *${data.supplier_name || 'TBD'}*.`
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*📋 Procurement #:*\n\`${data.procurement_number || 'Generating...'}\`` },
          { type: "mrkdwn", text: `*📦 Product:*\n${data.product_name}` },
          { type: "mrkdwn", text: `*📂 Category:*\n${data.product_category || 'N/A'}` },
          { type: "mrkdwn", text: `*🔢 Quantity:*\n${data.quantity} units` },
          { type: "mrkdwn", text: `*💵 Total Amount:*\n${formatCurrency(data.total_amount as number)}` },
          { type: "mrkdwn", text: `*${paymentEmoji} Payment:*\n${paymentStatus.toUpperCase()}` }
        ]
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `🏭 *Supplier:* ${data.supplier_name || 'Not assigned'} • 📅 *Due:* ${data.payment_due_date || 'N/A'}` }
        ]
      },
      { type: "divider" }
    ]
  };
};

const getSupplierBlocks = (data: Record<string, unknown>) => {
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🏭 New Supplier Registered",
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `A new supplier *${data.name}* has been added to the vendor database.`
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*🏢 Supplier Name:*\n${data.name}` },
          { type: "mrkdwn", text: `*👤 Contact Person:*\n${data.contact_person || 'N/A'}` },
          { type: "mrkdwn", text: `*📧 Email:*\n${data.email || 'N/A'}` },
          { type: "mrkdwn", text: `*📞 Phone:*\n${data.phone || 'N/A'}` },
          { type: "mrkdwn", text: `*📂 Category:*\n${data.category || 'General'}` },
          { type: "mrkdwn", text: `*📍 Location:*\n${data.location || 'N/A'}` }
        ]
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `✅ Supplier is now available for procurement orders.` }
        ]
      },
      { type: "divider" }
    ]
  };
};

const getHotLeadBlocks = (data: Record<string, unknown>) => {
  const isMegaDeal = data.is_mega_deal === true;
  const source = data.source || 'enquiry';
  
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: isMegaDeal ? "🌟 MEGA DEAL ALERT!" : "🔥 HOT LEAD ALERT!",
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: isMegaDeal 
            ? "🎯 *Major opportunity identified!* This deal requires immediate attention and management oversight."
            : "⚡ *High-priority lead detected!* Customer shows strong buying signals - fast response critical."
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*👤 Customer:*\n${data.customer_name}` },
          { type: "mrkdwn", text: `*🏢 Company:*\n${data.customer_company}` },
          { type: "mrkdwn", text: `*📦 Product:*\n${data.product_name}` },
          { type: "mrkdwn", text: `*🔢 Quantity:*\n${data.quantity} units` },
          { type: "mrkdwn", text: `*💰 Potential Value:*\n${formatCurrency(data.expected_price as number)}` },
          { type: "mrkdwn", text: `*📍 Source:*\n${(source as string).charAt(0).toUpperCase() + (source as string).slice(1)}` }
        ]
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `🧑‍💼 *Owner:* ${data.sales_person_name} • ⏰ *Action Required:* Respond within 2 hours` }
        ]
      },
      { type: "divider" }
    ]
  };
};

const getPaymentReminderBlocks = (data: Record<string, unknown>) => {
  const isOverdue = data.is_overdue === true;
  const daysOverdue = data.days_overdue as number || 0;
  const balance = (data.balance as number) || ((data.total_amount as number || 0) - (data.amount_paid as number || 0));
  
  let headerText = "💰 Payment Due Soon";
  let urgencyText = "Payment is due soon. Please follow up with the customer.";
  
  if (isOverdue) {
    if (daysOverdue > 7) {
      headerText = "🚨 CRITICAL: Payment Severely Overdue!";
      urgencyText = `⚠️ Payment is *${daysOverdue} days overdue*. Escalation may be required.`;
    } else {
      headerText = "⚠️ Payment Overdue!";
      urgencyText = `Payment is *${daysOverdue} days overdue*. Immediate follow-up required.`;
    }
  }
  
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: headerText,
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: urgencyText
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*📋 Order:*\n\`${data.order_number || 'N/A'}\`` },
          { type: "mrkdwn", text: `*👤 Customer:*\n${data.customer_name}` },
          { type: "mrkdwn", text: `*🏢 Company:*\n${data.customer_company}` },
          { type: "mrkdwn", text: `*💵 Total Amount:*\n${formatCurrency(data.total_amount as number)}` },
          { type: "mrkdwn", text: `*✅ Amount Paid:*\n${formatCurrency(data.amount_paid as number)}` },
          { type: "mrkdwn", text: `*⚠️ Balance Due:*\n${formatCurrency(balance)}` }
        ]
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `📅 *Due Date:* ${data.due_date || 'N/A'} • 📦 *Product:* ${data.product_name || 'N/A'}` }
        ]
      },
      { type: "divider" }
    ]
  };
};

const getStatusChangeBlocks = (data: Record<string, unknown>) => {
  const statusEmojis: Record<string, string> = {
    'po_received': '📄',
    'in_progress': '🔄',
    'shipped': '🚚',
    'delivered': '📬',
    'delivery_done': '✅',
    'cancelled': '❌',
    'rto': '↩️'
  };
  
  const newStatus = data.new_status as string || '';
  const emoji = statusEmojis[newStatus] || '📦';
  const formattedStatus = newStatus.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  
  let contextMessage = "Order status has been updated.";
  if (newStatus === 'delivered' || newStatus === 'delivery_done') {
    contextMessage = "🎉 Order has been successfully delivered to the customer!";
  } else if (newStatus === 'shipped') {
    contextMessage = "📦 Order has been dispatched and is on its way.";
  } else if (newStatus === 'cancelled') {
    contextMessage = "❌ Order has been cancelled.";
  }
  
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${emoji} Order Status: ${formattedStatus}`,
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: contextMessage
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*📋 Order:*\n\`${data.order_number || 'N/A'}\`` },
          { type: "mrkdwn", text: `*👤 Customer:*\n${data.customer_name}` },
          { type: "mrkdwn", text: `*📦 Product:*\n${data.product_name || 'N/A'}` },
          { type: "mrkdwn", text: `*🔄 Previous Status:*\n${(data.old_status as string || 'N/A').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}` }
        ]
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `🧑‍💼 *Sales:* ${data.sales_person_name || 'N/A'} • 📅 *Updated:* ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` }
        ]
      },
      { type: "divider" }
    ]
  };
};

// Send message via Slack Bot API
async function sendSlackBotMessage(botToken: string, channel: string, blocks: object) {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: channel,
      ...blocks
    })
  });
  
  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.error || 'Slack API error');
  }
  return result;
}

// Send message via Webhook
async function sendSlackWebhook(webhookUrl: string, blocks: object) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(blocks)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Webhook error');
  }
  return response;
}

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

    // Handle test_channel - direct test without checking settings
    if (type === 'test_channel') {
      const channel = data.channel as string;
      const botToken = data.bot_token as string;
      
      if (!channel || !botToken) {
        return new Response(
          JSON.stringify({ success: false, error: 'Channel and bot token required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const testMessage = {
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "🧪 Test Message from XBoom Flow",
              emoji: true
            }
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `✅ This channel is configured correctly! You will receive notifications here.`
            }
          }
        ]
      };

      try {
        await sendSlackBotMessage(botToken, channel, testMessage);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error: unknown) {
        console.error('Slack bot test error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return new Response(
          JSON.stringify({ success: false, error: errorMessage }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
    }

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
    if (!settings?.is_enabled) {
      console.log('Slack notifications are disabled');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Slack disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle test message type (webhook test)
    if (type === 'test') {
      const testWebhookUrl = data.webhook_url as string;
      if (!testWebhookUrl) {
        return new Response(
          JSON.stringify({ success: false, error: 'No webhook URL provided for test' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const testMessage = {
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "🧪 Test Message from XBoom Flow",
              emoji: true
            }
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "✅ Your Slack integration is working correctly! You will now receive notifications for enabled events."
            }
          }
        ]
      };

      try {
        await sendSlackWebhook(testWebhookUrl, testMessage);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error: unknown) {
        console.error('Slack test webhook error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return new Response(
          JSON.stringify({ success: false, error: 'Slack webhook test failed', details: errorMessage }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
    }

    // Determine which channel to use and check if notification type is enabled
    const channelMap: Record<string, { channelKey: string; settingKey: string }> = {
      'new_order': { channelKey: 'channel_orders', settingKey: 'notify_new_orders' },
      'status_change': { channelKey: 'channel_orders', settingKey: 'notify_status_changes' },
      'new_enquiry': { channelKey: 'channel_enquiries', settingKey: 'notify_new_enquiries' },
      'hot_lead': { channelKey: 'channel_enquiries', settingKey: 'notify_hot_leads' },
      'new_pipeline': { channelKey: 'channel_pipeline', settingKey: 'notify_new_pipeline' },
      'new_procurement': { channelKey: 'channel_procurements', settingKey: 'notify_new_procurements' },
      'new_supplier': { channelKey: 'channel_suppliers', settingKey: 'notify_new_suppliers' },
      'payment_reminder': { channelKey: 'channel_orders', settingKey: 'notify_payment_reminders' },
    };

    const mapping = channelMap[type];
    if (!mapping) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unknown notification type' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check if notification type is enabled
    if (!settings[mapping.settingKey]) {
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
      case 'new_enquiry':
        slackMessage = getEnquiryBlocks(data);
        break;
      case 'new_pipeline':
        slackMessage = getPipelineBlocks(data);
        break;
      case 'new_procurement':
        slackMessage = getProcurementBlocks(data);
        break;
      case 'new_supplier':
        slackMessage = getSupplierBlocks(data);
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

    // Try multi-channel bot first, fallback to webhook
    const botToken = settings.slack_bot_token;
    const channel = settings[mapping.channelKey];

    if (botToken && channel) {
      // Use Slack Bot API for multi-channel
      try {
        await sendSlackBotMessage(botToken, channel, slackMessage);
        console.log(`Slack notification sent to channel ${channel}`);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Slack bot error, falling back to webhook:', error);
        // Fall through to webhook
      }
    }

    // Fallback to webhook if configured
    if (settings.webhook_url) {
      try {
        await sendSlackWebhook(settings.webhook_url, slackMessage);
        console.log('Slack notification sent via webhook');
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error: unknown) {
        console.error('Slack webhook error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return new Response(
          JSON.stringify({ success: false, error: 'Slack notification failed', details: errorMessage }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
    }

    console.log('No Slack delivery method configured');
    return new Response(
      JSON.stringify({ success: true, skipped: true, reason: 'No channel or webhook configured' }),
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
