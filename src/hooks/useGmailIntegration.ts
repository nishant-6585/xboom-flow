import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface GmailIntegration {
  id: string;
  user_id: string;
  email: string;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
}

export interface GmailSyncLog {
  id: string;
  integration_id: string;
  emails_fetched: number;
  leads_created: number;
  errors: string | null;
  created_at: string;
}

export function useGmailIntegration() {
  const queryClient = useQueryClient();

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['gmail-integrations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gmail_integrations')
        .select('id, user_id, email, is_active, last_synced_at, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as GmailIntegration[];
    },
  });

  const { data: syncLogs = [] } = useQuery({
    queryKey: ['gmail-sync-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gmail_sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as GmailSyncLog[];
    },
  });

  const connectGmail = useMutation({
    mutationFn: async () => {
      const redirectUri = window.location.origin + '/sales';
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/gmail-oauth-callback`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ redirect_uri: redirectUri }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get OAuth URL');
      return data.url as string;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err: Error) => {
      toast.error(`Gmail connection failed: ${err.message}`);
    },
  });

  const syncNow = useMutation({
    mutationFn: async (integrationId?: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/gmail-lead-sync`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(integrationId ? { integration_id: integrationId } : {}),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['gmail-integrations'] });
      queryClient.invalidateQueries({ queryKey: ['gmail-sync-logs'] });
      queryClient.invalidateQueries({ queryKey: ['email-leads'] });
      const results = data.results || [];
      const totalLeads = results.reduce((s: number, r: any) => s + (r.leads_created || 0), 0);
      const totalFetched = results.reduce((s: number, r: any) => s + (r.emails_fetched || 0), 0);
      toast.success(`Sync complete: ${totalFetched} emails scanned, ${totalLeads} leads created`);
    },
    onError: (err: Error) => {
      toast.error(`Sync failed: ${err.message}`);
    },
  });

  const toggleIntegration = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('gmail_integrations')
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gmail-integrations'] });
      toast.success('Integration updated');
    },
  });

  const disconnectGmail = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('gmail_integrations')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gmail-integrations'] });
      toast.success('Gmail disconnected');
    },
  });

  return {
    integrations,
    syncLogs,
    isLoading,
    connectGmail: connectGmail.mutate,
    isConnecting: connectGmail.isPending,
    syncNow: syncNow.mutate,
    isSyncing: syncNow.isPending,
    toggleIntegration: toggleIntegration.mutate,
    disconnectGmail: disconnectGmail.mutate,
  };
}
