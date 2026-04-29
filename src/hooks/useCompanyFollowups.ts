import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Followup } from './useFollowups';

/**
 * Fetches all follow-ups linked directly to a company (source_type='company').
 */
export function useCompanyFollowups(companyId: string | null) {
  const { data = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['company-followups', companyId],
    queryFn: async (): Promise<Followup[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('followups')
        .select('*')
        .eq('source_type', 'company')
        .eq('source_id', companyId)
        .order('followup_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Followup[];
    },
    enabled: !!companyId,
  });

  return { followups: data, loading, refetch };
}

/**
 * Aggregate pending follow-ups linked to companies — grouped by company_id.
 * Used by the Companies dashboard.
 */
export function useAllCompanyFollowups() {
  const { data = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['all-company-followups'],
    queryFn: async (): Promise<Followup[]> => {
      const { data, error } = await supabase
        .from('followups')
        .select('*')
        .eq('source_type', 'company')
        .in('status', ['pending', 'missed'])
        .order('followup_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Followup[];
    },
    staleTime: 60 * 1000,
  });

  return { followups: data, loading, refetch };
}