import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { Followup } from '@/hooks/useFollowups';

export const FOLLOWUP_MODES = [
  { value: 'call', label: 'Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'site_visit', label: 'Site visit' },
  { value: 'demo', label: 'Demo' },
  { value: 'other', label: 'Other' },
] as const;

export const FOLLOWUP_OUTCOMES = [
  { value: 'interested', label: 'Interested' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'awaiting_po', label: 'Awaiting PO' },
  { value: 'awaiting_payment', label: 'Awaiting payment' },
  { value: 'no_response', label: 'No response' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'other', label: 'Other' },
] as const;

export const modeLabel = (v?: string | null) =>
  FOLLOWUP_MODES.find(m => m.value === v)?.label ?? (v ? v.replace(/_/g, ' ') : null);
export const outcomeLabel = (v?: string | null) =>
  FOLLOWUP_OUTCOMES.find(m => m.value === v)?.label ?? (v ? v.replace(/_/g, ' ') : null);

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export interface PipelineFollowupRow {
  pipeline_id: string;
  customer_name: string;
  customer_company: string | null;
  product_name: string | null;
  quantity: number | null;
  expected_price: number | null;
  pipeline_status: string;
  sales_person_id: string | null;
  sales_person_name: string | null;
  lead_source: string | null;
  phone: string | null;
  email: string | null;
  expected_closure_date: string | null;
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

export type FollowupWithMode = Followup & {
  mode: string | null;
  outcome: string | null;
  sequence_no: number | null;
};

export function usePipelineFollowupTracker() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['pipeline-followup-tracker'],
    queryFn: async (): Promise<PipelineFollowupRow[]> => {
      const { data, error } = await (supabase as any).rpc('get_pipeline_followup_tracker');
      if (error) throw error;
      return (data ?? []) as PipelineFollowupRow[];
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['pipeline-followup-tracker'] });
    queryClient.invalidateQueries({ queryKey: ['pipeline-followup-timeline'] });
    queryClient.invalidateQueries({ queryKey: ['followups'] });
  };

  return { rows: data, loading, refetch, invalidate };
}

export function usePipelineFollowupTimeline(pipelineId: string | null) {
  const { data = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['pipeline-followup-timeline', pipelineId],
    queryFn: async (): Promise<FollowupWithMode[]> => {
      if (!pipelineId) return [];
      const { data, error } = await supabase
        .from('followups')
        .select('*')
        .eq('source_type', 'pipeline')
        .eq('source_id', pipelineId)
        .order('followup_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as FollowupWithMode[];
    },
    enabled: !!pipelineId,
  });

  return { followups: data, loading, refetch };
}

export interface LogFollowupInput {
  row: PipelineFollowupRow;
  /** existing pending follow-up to complete, if any */
  completeId?: string | null;
  followupAt: string;
  mode: string;
  outcome?: string | null;
  remark: string;
  nextFollowupAt?: string | null;
}

export function useLogPipelineFollowup() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['pipeline-followup-tracker'] });
    queryClient.invalidateQueries({ queryKey: ['pipeline-followup-timeline'] });
    queryClient.invalidateQueries({ queryKey: ['followups'] });
  };

  const logFollowup = async (input: LogFollowupInput): Promise<boolean> => {
    if (!user || !profile) {
      toast.error('Not authenticated');
      return false;
    }
    const { row } = input;
    const base = {
      source_type: 'pipeline' as const,
      source_id: row.pipeline_id,
      customer_name: row.customer_name,
      customer_company: row.customer_company,
      product_name: row.product_name,
      phone: row.phone,
      email: row.email,
      user_id: row.sales_person_id ?? user.id,
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