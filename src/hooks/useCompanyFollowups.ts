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
      const { data, error } = await (supabase as any).rpc('get_company_followups', {
        _company_id: companyId,
      });
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
      const { data, error } = await (supabase as any).rpc('get_all_company_followups');
      if (error) throw error;
      return ((data ?? []) as any[]).sort((a, b) =>
        (a.followup_at || '').localeCompare(b.followup_at || '')
      ) as unknown as Followup[];
    },
    staleTime: 60 * 1000,
  });

  return { followups: data, loading, refetch };
}