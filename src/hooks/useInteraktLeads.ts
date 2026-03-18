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
      const { data, error } = await supabase.functions.invoke('sync-interakt-contacts', {
        body: {},
      });

      if (error) {
        const message =
          typeof error.message === 'string' && error.message.trim().length > 0
            ? error.message
            : 'Sync failed';
        throw new Error(message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data;
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
