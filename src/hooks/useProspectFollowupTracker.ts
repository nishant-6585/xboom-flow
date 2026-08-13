import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { Followup } from '@/hooks/useFollowups';
import {
  FOLLOWUP_MODES,
  FOLLOWUP_OUTCOMES,
  modeLabel,
  outcomeLabel,
  ordinal,
  type FollowupWithMode,
} from '@/hooks/usePipelineFollowupTracker';

export { FOLLOWUP_MODES, FOLLOWUP_OUTCOMES, modeLabel, outcomeLabel, ordinal };
export type { FollowupWithMode };

export interface ProspectFollowupRow {
  prospect_id: string;
  customer_name: string;
  customer_company: string | null;
  product_name: string | null;
  quantity: number | null;
  quoted_price: number | null;
  prospect_status: string;
  owner_id: string | null;
  owner_name: string | null;
  lead_source: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  is_a_category: boolean;
  created_at: string;
  followup_count: number;
  last_followup_at: string | null;
  last_followup_mode: string | null;
  last_followup_outcome: string | null;
  last_followup_remark: string | null;
  last_followup_by: string | null;
  last_sequence_no: number;
  next_followup_at: string | null;
  next_followup_id: string | null;
}

export function useProspectFollowupTracker() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['prospect-followup-tracker'],
    queryFn: async (): Promise<ProspectFollowupRow[]> => {
      const { data, error } = await (supabase as any).rpc('get_prospect_followup_tracker');
      if (error) throw error;
      return (data ?? []) as ProspectFollowupRow[];
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['prospect-followup-tracker'] });
    queryClient.invalidateQueries({ queryKey: ['prospect-followup-timeline'] });
    queryClient.invalidateQueries({ queryKey: ['followups'] });
  };

  return { rows: data, loading, refetch, invalidate };
}

export function useProspectFollowupTimeline(prospectId: string | null) {
  const { data = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['prospect-followup-timeline', prospectId],
    queryFn: async (): Promise<FollowupWithMode[]> => {
      if (!prospectId) return [];
      const { data, error } = await supabase
        .from('followups')
        .select('*')
        .eq('source_type', 'prospect')
        .eq('source_id', prospectId)
        .order('followup_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as FollowupWithMode[];
    },
    enabled: !!prospectId,
  });

  return { followups: data, loading, refetch };
}

export interface LogProspectFollowupInput {
  row: ProspectFollowupRow;
  /** existing pending follow-up to complete, if any */
  completeId?: string | null;
  followupAt: string;
  mode: string;
  outcome?: string | null;
  remark: string;
  nextFollowupAt?: string | null;
}

export function useLogProspectFollowup() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['prospect-followup-tracker'] });
    queryClient.invalidateQueries({ queryKey: ['prospect-followup-timeline'] });
    queryClient.invalidateQueries({ queryKey: ['followups'] });
  };

  const logFollowup = async (input: LogProspectFollowupInput): Promise<boolean> => {
    if (!user || !profile) {
      toast.error('Not authenticated');
      return false;
    }
    const { row } = input;
    const base = {
      source_type: 'prospect' as const,
      source_id: row.prospect_id,
      customer_name: row.customer_name,
      customer_company: row.customer_company,
      product_name: row.product_name,
      phone: row.phone,
      email: row.email,
      user_id: row.owner_id ?? user.id,
      created_by: user.id,
      created_by_name: profile.name,
    };

    try {
      if (input.completeId) {
        const { error } = await supabase
          .from('followups')
          .update({
            status: 'completed',
            mode: input.mode,
            outcome: input.outcome || null,
            remark: input.remark,
            followup_at: input.followupAt,
            completed_at: new Date().toISOString(),
            completed_by: user.id,
            completed_by_name: profile.name,
          } as any)
          .eq('id', input.completeId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('followups').insert({
          ...base,
          followup_at: input.followupAt,
          mode: input.mode,
          outcome: input.outcome || null,
          remark: input.remark,
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: user.id,
          completed_by_name: profile.name,
        } as any);
        if (error) throw error;
      }

      if (input.nextFollowupAt) {
        const { error } = await supabase.from('followups').insert({
          ...base,
          followup_at: input.nextFollowupAt,
          status: 'pending',
        } as any);
        if (error) throw error;
      }

      invalidate();
      toast.success(input.nextFollowupAt ? 'Follow-up logged & next one scheduled ✅' : 'Follow-up logged ✅');
      return true;
    } catch (e: any) {
      toast.error(e.message || 'Failed to log follow-up');
      return false;
    }
  };

  return { logFollowup };
}
