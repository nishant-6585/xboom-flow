import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MyOperatorConfig {
  id: string;
  is_connected: boolean;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export const useMyOperatorConfig = () => {
  const [config, setConfig] = useState<MyOperatorConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-myoperator-config', {
        body: { action: 'status' },
      });

      if (error) {
        console.error('Error fetching MyOperator config:', error);
        return;
      }
      setConfig(data?.config as MyOperatorConfig | null);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = async (values: {
    api_token: string;
    secret_key: string;
    x_api_key: string;
    company_id: string;
  }) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-myoperator-config', {
        body: { action: 'save', ...values },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to save configuration');

      toast.success('MyOperator configuration saved');
      await fetchConfig();
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error(err.message || 'Failed to save configuration');
    }
  };

  const disconnect = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-myoperator-config', {
        body: { action: 'disconnect' },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to disconnect');

      toast.success('MyOperator disconnected');
      await fetchConfig();
    } catch (err: any) {
      toast.error(err.message || 'Failed to disconnect');
    }
  };

  const testConnection = async (values: {
    api_token: string;
    x_api_key: string;
    company_id: string;
  }): Promise<boolean> => {
    if (!values.api_token || !values.x_api_key || !values.company_id) {
      toast.error('Please fill in all required fields');
      return false;
    }

    try {
      const { data, error } = await supabase.functions.invoke('manage-myoperator-config', {
        body: { action: 'test', ...values },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Connection test passed');
        return true;
      } else {
        toast.error(data?.error || 'Connection test failed');
        return false;
      }
    } catch (err: any) {
      toast.error(err.message || 'Connection test failed');
      return false;
    }
  };

  return { config, loading, saveConfig, disconnect, testConnection, refetch: fetchConfig };
};
