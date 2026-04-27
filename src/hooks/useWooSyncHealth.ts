import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface WooSyncState {
  last_backfill_started_at: string | null;
  last_backfill_completed_at: string | null;
  last_incremental_at: string | null;
  total_orders_synced: number | null;
  total_in_woocommerce: number | null;
  updated_at: string | null;
}

export interface WooSyncRun {
  id: string;
  mode: string;
  status: string;
  pages_fetched: number | null;
  orders_upserted: number | null;
  errors: number | null;
  total_in_woocommerce: number | null;
  triggered_by: string;
  message: string | null;
  started_at: string;
  completed_at: string | null;
  has_more: boolean | null;
  next_page: number | null;
}

export type SyncHealth = 'healthy' | 'lagging' | 'broken' | 'unknown';

export function useWooSyncHealth() {
  const [state, setState] = useState<WooSyncState | null>(null);
  const [recentRuns, setRecentRuns] = useState<WooSyncRun[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: stateRow }, { data: runs }] = await Promise.all([
        supabase
          .from('woocommerce_sync_state')
          .select('*')
          .eq('id', 1)
          .maybeSingle(),
        supabase
          .from('woocommerce_sync_runs')
          .select('id, mode, status, pages_fetched, orders_upserted, errors, total_in_woocommerce, triggered_by, message, started_at, completed_at, has_more, next_page')
          .order('started_at', { ascending: false })
          .limit(10),
      ]);
      setState((stateRow as WooSyncState) ?? null);
      setRecentRuns((runs as WooSyncRun[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const channel = supabase
      .channel('woo_sync_runs_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'woocommerce_sync_runs' },
        () => fetchHealth(),
      )
      .subscribe();
    // Refetch every 60s as a safety net
    const id = setInterval(fetchHealth, 60_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(id);
    };
  }, [fetchHealth]);

  // Derive health
  const lastIncremental = state?.last_incremental_at
    ? new Date(state.last_incremental_at).getTime()
    : null;
  const ageMin = lastIncremental ? (Date.now() - lastIncremental) / 60_000 : null;

  const lastFailedRun = recentRuns.find(r => r.status === 'failed');
  const lastSuccessRun = recentRuns.find(r => r.status === 'success' || r.status === 'partial');

  let health: SyncHealth = 'unknown';
  if (lastFailedRun && (!lastSuccessRun || new Date(lastFailedRun.started_at) > new Date(lastSuccessRun.started_at))) {
    health = 'broken';
  } else if (ageMin == null) {
    health = 'unknown';
  } else if (ageMin <= 30) {
    health = 'healthy';
  } else if (ageMin <= 120) {
    health = 'lagging';
  } else {
    health = 'broken';
  }

  // Sync gap (Woo total vs DB total)
  const wooTotal = state?.total_in_woocommerce ?? null;
  const dbTotal = state?.total_orders_synced ?? null;
  const gap = (wooTotal != null && dbTotal != null) ? Math.max(0, wooTotal - dbTotal) : null;

  return {
    state,
    recentRuns,
    loading,
    health,
    wooTotal,
    dbTotal,
    gap,
    refetch: fetchHealth,
  };
}