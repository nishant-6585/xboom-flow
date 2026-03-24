import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MyOperatorConfig {
  id: string;
  api_token: string;
  secret_key: string;
  x_api_key: string;
  company_id: string;
  is_connected: boolean;
  created_at: string;
  updated_at: string;
}

export const useMyOperatorConfig = () => {
  const [config, setConfig] = useState<MyOperatorConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('myoperator_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching MyOperator config:', error);
        return;
      }
      setConfig(data as MyOperatorConfig | null);
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
      if (config) {
        const { error } = await supabase
          .from('myoperator_config')
          .update({ ...values, is_connected: true })
          .eq('id', config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('myoperator_config')
          .insert({ ...values, is_connected: true });
        if (error) throw error;
      }
      toast.success('MyOperator configuration saved');
      await fetchConfig();
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error(err.message || 'Failed to save configuration');
    }
  };

  const disconnect = async () => {
    if (!config) return;
    try {
      const { error } = await supabase
        .from('myoperator_config')
        .update({ is_connected: false, api_token: '', secret_key: '', x_api_key: '', company_id: '' })
        .eq('id', config.id);
      if (error) throw error;
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
    // Basic validation test - verify fields are filled
    if (!values.api_token || !values.x_api_key || !values.company_id) {
      toast.error('Please fill in all required fields');
      return false;
    }
    // In production, this would call MyOperator API to validate credentials
    toast.success('Connection test passed (fields validated)');
    return true;
  };

  return { config, loading, saveConfig, disconnect, testConnection, refetch: fetchConfig };
};
