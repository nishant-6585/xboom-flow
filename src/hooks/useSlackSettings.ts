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
  channel_enquiries: string | null;
  channel_procurements: string | null;
  channel_suppliers: string | null;
  channel_pipeline: string | null;
  channel_tickets: string | null;
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
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/send-slack-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`
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
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/send-slack-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`
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

  return {
    settings,
    loading,
    updateSettings,
    testWebhook,
    testChannel,
    refetch: fetchSettings
  };
};

// Helper function to send Slack notifications from other hooks
export const sendSlackNotification = async (
  type: 'new_order' | 'hot_lead' | 'payment_reminder' | 'status_change' | 'new_enquiry' | 'new_procurement' | 'new_supplier' | 'new_pipeline' | 'ticket_assigned' | 'ticket_status_change',
  data: Record<string, unknown>
) => {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/send-slack-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
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
