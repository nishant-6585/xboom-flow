import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface InteraktLead {
  id: string;
  customer_name: string;
  phone_number: string;
  country_code: string;
  email: string | null;
  source: string;
  status: string;
  interakt_user_id: string | null;
  interakt_traits: Record<string, unknown> | null;
  synced_at: string;
  synced_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useInteraktLeads() {
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['interakt-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interakt_leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as InteraktLead[];
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/sync-interakt-contacts`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({}),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Sync failed');
      }

      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['interakt-leads'] });
      toast.success(
        `Sync complete: ${data.created} new leads, ${data.skipped} skipped`
      );
    },
    onError: (error: Error) => {
      toast.error(`Sync failed: ${error.message}`);
    },
  });

  return {
    leads,
    loading,
    refetch,
    syncFromInterakt: syncMutation.mutate,
    syncing: syncMutation.isPending,
  };
}
