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
      // Supabase caps a single .select() at 1000 rows by default, which
      // was causing the Interakt tab and analytics to permanently show
      // a "1000" count even when there are thousands of leads. Page
      // through the table in 1000-row chunks so we always return the
      // full set, sorted by the lead's actual Interakt creation time
      // (shown in the "Created On" column) so the newest appear first.
      const PAGE = 1000;
      const all: InteraktLead[] = [];
      let from = 0;
      // Hard safety cap to avoid runaway loops if the table ever grows
      // unexpectedly large; bump if needed.
      const MAX_ROWS = 100000;
      while (from < MAX_ROWS) {
        const { data, error } = await supabase
          .from('interakt_leads')
          .select('*')
          .order('interakt_created_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);

        if (error) throw error;
        const batch = (data ?? []) as unknown as InteraktLead[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      return all;
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
