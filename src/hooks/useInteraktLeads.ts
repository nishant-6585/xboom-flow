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
  city: string | null;
  product_name: string | null;
  company: string | null;
  notes: string | null;
  interakt_user_id: string | null;
  interakt_traits: Record<string, unknown> | null;
  interakt_created_at: string | null;
  synced_at: string;
  synced_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // New lead-form fields
  customer_company: string | null;
  product_category: string | null;
  product_code: string | null;
  quantity: number | null;
  lead_source: string | null;
  urgency: string | null;
  requested_timeline: string | null;
  purpose_of_purchase: string | null;
  sales_person_id: string | null;
  sales_person_name: string | null;
}

export function useInteraktLeads() {
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['interakt-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interakt_leads')
        .select('*')
        // Sort by the lead's actual creation time on Interakt (shown in
        // the "Created On" column), not the row's DB sync time, so the
        // newest leads always appear at the top of the list.
        .order('interakt_created_at', { ascending: false, nullsFirst: false })
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

  const updateMutation = useMutation({
    mutationFn: async (lead: Partial<InteraktLead> & { id: string }) => {
      const { id, ...updates } = lead;
      const { error } = await supabase
        .from('interakt_leads')
        .update(updates as Record<string, unknown>)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interakt-leads'] });
      toast.success('Lead updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Update failed: ${error.message}`);
    },
  });

  return {
    leads,
    loading,
    refetch,
    syncFromInterakt: syncMutation.mutate,
    syncing: syncMutation.isPending,
    updateLead: updateMutation.mutateAsync,
    updating: updateMutation.isPending,
  };
}
