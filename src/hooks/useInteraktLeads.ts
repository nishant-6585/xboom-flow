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
  disposition?: string | null;
  disposition_reason_code?: string | null;
  disposition_reason_note?: string | null;
  disposition_at?: string | null;
  disposition_by_name?: string | null;
}

// Columns needed by the table / drawer / export. `interakt_traits` is a heavy
// jsonb blob (several MB across the table) and is only used inside the edit
// dialog, so it is fetched lazily there instead of in the list query.
const LIST_COLUMNS = [
  'id','customer_name','phone_number','country_code','email','source','status','city',
  'product_name','company','notes','interakt_user_id','interakt_created_at','synced_at',
  'synced_by','updated_by','created_at','updated_at','customer_company','product_category',
  'product_code','quantity','lead_source','urgency','requested_timeline','purpose_of_purchase',
  'sales_person_id','sales_person_name','disposition','disposition_reason_code',
  'disposition_reason_note','disposition_at','disposition_by_name',
].join(',');

export function useInteraktLeads() {
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['interakt-leads', 'all'],
    // Keep the fetched set warm so re-opening the Interakt tab renders instantly
    // instead of re-downloading thousands of rows.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Supabase caps a single .select() at 1000 rows, so the full set has to be
      // paged. Ask for the row count first, then fetch every page in parallel —
      // the old sequential loop meant ~15 round-trips one after another.
      const PAGE = 1000;
      const MAX_ROWS = 100000;

      const fetchPage = async (from: number) => {
        const { data, error } = await supabase
          .from('interakt_leads')
          .select(LIST_COLUMNS, { count: from === 0 ? 'exact' : undefined })
          .order('interakt_created_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        return data as unknown as InteraktLead[];
      };

      const { data: first, error: firstErr, count } = await supabase
        .from('interakt_leads')
        .select(LIST_COLUMNS, { count: 'exact' })
        .order('interakt_created_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(0, PAGE - 1);
      if (firstErr) throw firstErr;

      const all = (first ?? []) as unknown as InteraktLead[];
      const total = Math.min(count ?? all.length, MAX_ROWS);
      if (total <= PAGE) return all;

      const offsets: number[] = [];
      for (let from = PAGE; from < total; from += PAGE) offsets.push(from);
      const pages = await Promise.all(offsets.map(fetchPage));
      pages.forEach((p) => all.push(...p));
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
