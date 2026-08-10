import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SlackSettings {
  id: string;
  is_enabled: boolean;
  // Legacy single channel notifications
  notify_new_orders: boolean;
  notify_hot_leads: boolean;
  notify_payment_reminders: boolean;
  notify_status_changes: boolean;
  // New multi-channel notifications
  notify_new_enquiries: boolean;
  notify_new_procurements: boolean;
  notify_new_suppliers: boolean;
  notify_new_pipeline: boolean;
  // Ticket notifications
  notify_ticket_assigned: boolean;
  notify_ticket_status_change: boolean;
  // Channel IDs for each event type
  channel_orders: string | null;
  channel_order_status?: string | null;
  channel_enquiries: string | null;
  channel_procurements: string | null;
  channel_suppliers: string | null;
  channel_pipeline: string | null;
  channel_tickets: string | null;
  // Sales report settings
  channel_sales_report: string | null;
  channel_prospect_pipeline: string | null;
  enable_daily_report: boolean;
  enable_weekly_report: boolean;
  enable_prospect_pipeline_report: boolean;
  enable_ai_insights: boolean;
  enable_interactive_actions: boolean;
  created_at: string;
  updated_at: string;
}

export const useSlackSettings = () => {
  const [settings, setSettings] = useState<SlackSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('slack_settings')
        .select('*')
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log('No Slack settings found');
        } else {
          console.error('Error fetching Slack settings:', error);
        }
        return;
      }

      setSettings(data);
    } catch (error) {
      console.error('Error fetching Slack settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = async (updates: Partial<SlackSettings>) => {
    try {
      if (!settings?.id) {
        const { data, error } = await supabase
          .from('slack_settings')
          .insert([updates])
          .select()
          .single();

        if (error) throw error;
        setSettings(data);
        toast.success('Slack settings saved');
        return data;
      }

      const { data, error } = await supabase
        .from('slack_settings')
        .update(updates)
        .eq('id', settings.id)
        .select()
        .single();

      if (error) throw error;
      setSettings(data);
      toast.success('Slack settings updated');
      return data;
    } catch (error) {
      console.error('Error updating Slack settings:', error);
      toast.error('Failed to update Slack settings');
      throw error;
    }
  };

  const testWebhook = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('You must be logged in to test the webhook');
        return false;
      }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/send-slack-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          type: 'test',
          data: {}
        })
      });

      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Webhook test failed');
      }

      toast.success('Test message sent to Slack!');
      return true;
    } catch (error) {
      console.error('Webhook test failed:', error);
      toast.error('Failed to send test message. Please check your webhook URL secret.');
      return false;
    }
  };

  const testChannel = async (channel: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('You must be logged in to test the channel');
        return false;
      }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/send-slack-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          type: 'test_channel',
          data: { channel }
        })
      });

      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Channel test failed');
      }

      toast.success(`Test message sent to #${channel}!`);
      return true;
    } catch (error) {
      console.error('Channel test failed:', error);
      toast.error('Failed to send test message. Please check your channel ID and bot token secret.');
      return false;
    }
  };

  const triggerSalesReport = async (timeframe: 'daily' | 'weekly' | 'mtd') => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('You must be logged in to trigger a report');
        return false;
      }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/ai-sales-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ timeframe, force: true })
      });

      const result = await response.json();
      
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Report generation failed');
      }

      if (result.no_activity) {
        toast.info('No sales activity for this period. Empty report sent.');
      } else {
        toast.success(`${timeframe.charAt(0).toUpperCase() + timeframe.slice(1)} sales report sent to Slack!`);
      }
      return true;
    } catch (error) {
      console.error('Sales report failed:', error);
      toast.error('Failed to generate sales report');
      return false;
    }
  };

  const triggerProspectPipelineReport = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('You must be logged in to trigger a report');
        return false;
      }
      const { data, error } = await supabase.functions.invoke('prospect-pipeline-report', {
        body: { force: true },
      });
      if (error) throw error;
      if ((data as { skipped?: boolean })?.skipped) {
        toast.info('Report skipped — enable Slack notifications first');
        return false;
      }
      toast.success('Prospect & pipeline report sent to Slack!');
      return true;
    } catch (error) {
      console.error('Prospect/pipeline report failed:', error);
      toast.error('Failed to send prospect & pipeline report');
      return false;
    }
  };

  return {
    settings,
    loading,
    updateSettings,
    testWebhook,
    testChannel,
    triggerSalesReport,
    triggerProspectPipelineReport,
    refetch: fetchSettings
  };
};

// Helper function to send Slack notifications from other hooks
export const sendSlackNotification = async (
  type: 'new_order' | 'hot_lead' | 'payment_reminder' | 'status_change' | 'new_enquiry' | 'new_procurement' | 'new_supplier' | 'new_pipeline' | 'ticket_assigned' | 'ticket_status_change',
  data: Record<string, unknown>
) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.error('No active session for Slack notification');
      return;
    }
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/send-slack-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ type, data })
    });

    if (!response.ok) {
      console.error('Failed to send Slack notification');
    }
  } catch (error) {
    // Don't throw - Slack notifications should fail silently
    console.error('Error sending Slack notification:', error);
  }
};
