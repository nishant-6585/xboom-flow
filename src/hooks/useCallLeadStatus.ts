import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'closed' | 'lost';

export interface CallLeadStatusRow {
  id: string;
  call_log_id: string;
  status: LeadStatus;
  contacted_at: string | null;
  qualified_at: string | null;
  closed_at: string | null;
  lost_at: string | null;
  notes: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetches lead status for a list of call_log ids and exposes a map.
 * Subscribes to realtime changes so the UI stays in sync.
 */
export function useCallLeadStatuses(callLogIds: string[]) {
  const [statuses, setStatuses] = useState<Record<string, CallLeadStatusRow>>({});

  const fetchStatuses = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setStatuses({});
      return;
    }
    const { data, error } = await supabase
      .from('call_lead_status')
      .select('*')
      .in('call_log_id', ids);
    if (error) {
      console.warn('[useCallLeadStatuses] fetch error', error);
      return;
    }
    const map: Record<string, CallLeadStatusRow> = {};
    (data ?? []).forEach((r: any) => (map[r.call_log_id] = r));
    setStatuses(map);
  }, []);

  useEffect(() => {
    fetchStatuses(callLogIds);
  }, [callLogIds.join(','), fetchStatuses]);

  useEffect(() => {
    const channel = supabase
      .channel('call_lead_status_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'call_lead_status' },
        (payload: any) => {
          const row = (payload.new ?? payload.old) as CallLeadStatusRow | undefined;
          if (!row?.call_log_id) return;
          setStatuses((prev) => {
            if (payload.eventType === 'DELETE') {
              const { [row.call_log_id]: _drop, ...rest } = prev;
              return rest;
            }
            return { ...prev, [row.call_log_id]: row };
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const setStatus = useCallback(
    async (callLogId: string, status: LeadStatus, notes?: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const userName =
        (user?.user_metadata?.full_name as string | undefined) ||
        (user?.email as string | undefined) ||
        'Unknown';
      const payload = {
        call_log_id: callLogId,
        status,
        notes: notes ?? null,
        updated_by: user?.id ?? null,
        updated_by_name: userName,
      };
      const { data, error } = await supabase
        .from('call_lead_status')
        .upsert(payload, { onConflict: 'call_log_id' })
        .select('*')
        .single();
      if (error) {
        toast.error(error.message || 'Failed to update status');
        return null;
      }
      setStatuses((prev) => ({ ...prev, [callLogId]: data as CallLeadStatusRow }));
      toast.success(`Marked as ${status}`);
      return data as CallLeadStatusRow;
    },
    [],
  );

  return { statuses, setStatus, refetch: () => fetchStatuses(callLogIds) };
}

export const STATUS_META: Record<LeadStatus, { label: string; emoji: string; className: string }> = {
  new:       { label: 'New',       emoji: '🟢', className: 'bg-success/10 text-success border-success/30' },
  contacted: { label: 'Contacted', emoji: '🔵', className: 'bg-primary/10 text-primary border-primary/30' },
  qualified: { label: 'Qualified', emoji: '🟣', className: 'bg-purple-500/10 text-purple-500 border-purple-500/30' },
  closed:    { label: 'Closed',    emoji: '⚫', className: 'bg-muted text-muted-foreground border-muted-foreground/30' },
  lost:      { label: 'Lost',      emoji: '🔴', className: 'bg-destructive/10 text-destructive border-destructive/30' },
};
