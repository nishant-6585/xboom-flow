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
      // Use SECURITY DEFINER RPC so sales_manager can list connected accounts
      // without exposing access_token / refresh_token columns.
      const { data, error } = await supabase.rpc('get_gmail_integrations_safe');
      if (error) throw error;
      const rows = ((data as any[]) || []).slice().sort((a, b) =>
        (b.created_at || '').localeCompare(a.created_at || '')
      );
      return rows as GmailIntegration[];
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
      console.log('[Gmail OAuth] Redirect URI (frontend):', redirectUri);
      console.log('[Gmail OAuth] Origin:', window.location.origin);
      
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const functionUrl = `https://${projectId}.supabase.co/functions/v1/gmail-oauth-callback`;
      console.log('[Gmail OAuth] Calling edge function:', functionUrl);
      
      const res = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ redirect_uri: redirectUri }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get OAuth URL');
      
      console.log('[Gmail OAuth] Generated OAuth URL:', data.url);
      
      // Parse and log key params for debugging
      try {
        const oauthUrl = new URL(data.url);
        console.log('[Gmail OAuth] Params:', {
          client_id: oauthUrl.searchParams.get('client_id'),
          redirect_uri: oauthUrl.searchParams.get('redirect_uri'),
          access_type: oauthUrl.searchParams.get('access_type'),
          prompt: oauthUrl.searchParams.get('prompt'),
          scope: oauthUrl.searchParams.get('scope'),
        });
      } catch { /* ignore parse errors */ }
      
      return data.url as string;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err: Error) => {
      console.error('[Gmail OAuth] Error:', err.message);
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

  const processWithAI = useMutation({
    mutationFn: async (leadId?: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/ai-email-lead-processor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'process', ...(leadId ? { lead_id: leadId } : {}) }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI processing failed');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['email-leads'] });
      queryClient.invalidateQueries({ queryKey: ['email-lead-metrics'] });
      const parts = [
        `${data.processed || 0} leads processed`,
        data.enquiries_created ? `${data.enquiries_created} enquiries` : null,
        data.rejected ? `${data.rejected} rejected` : null,
        data.needs_review ? `${data.needs_review} for review` : null,
        data.skipped_spam ? `${data.skipped_spam} spam filtered` : null,
        data.skipped_direct ? `${data.skipped_direct} auto-qualified` : null,
      ].filter(Boolean);
      toast.success(`AI (Claude): ${parts.join(', ')}`);
    },
    onError: (err: Error) => {
      toast.error(`AI processing failed: ${err.message}`);
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
    processWithAI: processWithAI.mutate,
    isProcessingAI: processWithAI.isPending,
    toggleIntegration: toggleIntegration.mutate,
    disconnectGmail: disconnectGmail.mutate,
  };
}
