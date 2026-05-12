import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, XCircle, Database, RefreshCw, Loader2 } from 'lucide-react';
import { useWooSyncHealth, type SyncHealth } from '@/hooks/useWooSyncHealth';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

function timeAgo(iso: string | null) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

const HEALTH_META: Record<SyncHealth, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  healthy:  { label: 'Healthy',  icon: CheckCircle2,  cls: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30' },
  lagging:  { label: 'Lagging',  icon: AlertTriangle, cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30' },
  broken:   { label: 'Broken',   icon: XCircle,       cls: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30' },
  unknown:  { label: 'Unknown',  icon: AlertTriangle, cls: 'bg-muted text-muted-foreground border-border' },
};

interface Props {
  /** Called after a manual sync/backfill is triggered, so the parent can refresh order lists too. */
  onSyncTriggered?: () => void;
}

export function WooSyncHealthCard({ onSyncTriggered }: Props = {}) {
  const { state, recentRuns, loading, health, wooTotal, dbTotal, gap, refetch } = useWooSyncHealth();
  const [running, setRunning] = useState<null | 'incremental' | 'backfill'>(null);

  const trigger = async (mode: 'incremental' | 'backfill') => {
    setRunning(mode);
    try {
      const { error } = await supabase.functions.invoke('sync-website-orders', {
        body: { mode, triggered_by: 'ui_dashboard', ...(mode === 'backfill' ? { start_page: 1, max_pages: 5 } : {}) },
      });
      if (error) throw error;
      toast({ title: `${mode === 'backfill' ? 'Backfill' : 'Incremental sync'} started`, description: 'Running in background — this card refreshes automatically.' });
      setTimeout(() => {
        refetch();
        onSyncTriggered?.();
      }, 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to start sync';
      // Background self-chain may close the request before responding — that's expected.
      toast({ title: 'Sync started', description: msg.includes('FunctionsFetchError') ? 'Running in background.' : msg });
      setTimeout(() => {
        refetch();
        onSyncTriggered?.();
      }, 3000);
    } finally {
      setRunning(null);
    }
  };

  const meta = HEALTH_META[health] ?? HEALTH_META.unknown;
  const HealthIcon = meta.icon;
  const lastRun = recentRuns[0];
  const lastFailedRun = recentRuns.find(r => r.status === 'failed');

  return (
    <Card className="border-border/50">
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary"><Database className="h-4 w-4" /></div>
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                Sync Health
                <Badge variant="outline" className={meta.cls}>
                  <HealthIcon className="h-3 w-3 mr-1" /> {meta.label}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">WooCommerce → XBoom</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => trigger('incremental')} disabled={!!running}>
              {running === 'incremental' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Sync now
            </Button>
            <Button size="sm" variant="outline" onClick={() => trigger('backfill')} disabled={!!running}>
              {running === 'backfill' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Full backfill
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-lg border border-border/50 p-3">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">In WooCommerce</div>
            <div className="text-lg font-bold">{loading ? '—' : (wooTotal?.toLocaleString('en-IN') ?? '—')}</div>
          </div>
          <div className="rounded-lg border border-border/50 p-3">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Synced in XBoom</div>
            <div className="text-lg font-bold">{loading ? '—' : (dbTotal?.toLocaleString('en-IN') ?? '—')}</div>
          </div>
          <div className="rounded-lg border border-border/50 p-3">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Gap</div>
            <div className={`text-lg font-bold ${gap && gap > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
              {gap == null ? '—' : gap.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="rounded-lg border border-border/50 p-3">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Last sync</div>
            <div className="text-lg font-bold">{timeAgo(state?.last_incremental_at ?? null)}</div>
          </div>
          <div className="rounded-lg border border-border/50 p-3">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Last backfill</div>
            <div className="text-lg font-bold">{timeAgo(state?.last_backfill_completed_at ?? null)}</div>
          </div>
        </div>

        {lastFailedRun && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-700 dark:text-red-400">
            Last failure: {lastFailedRun.message || 'unknown error'} ({timeAgo(lastFailedRun.started_at)})
          </div>
        )}
        {lastRun?.status === 'running' && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Sync in progress… (started {timeAgo(lastRun.started_at)})
          </div>
        )}

        {recentRuns.length > 0 && (
          <div className="text-[11px] text-muted-foreground">
            Recent runs: {recentRuns.slice(0, 5).map(r => `${r.mode}/${r.status}`).join(' · ')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}