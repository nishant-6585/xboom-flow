import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle, Clock, ExternalLink, CalendarClock } from 'lucide-react';
import { nextCronRun } from '@/lib/cronNext';

export type SyncKind = 'manual' | 'cron' | 'webhook';

export interface SyncRunStats {
  at: string;
  status?: string | null;
  added?: number;
  updated?: number;
  removed?: number;
  skipped?: number;
  failed?: number;
  error?: string | null;
}

export interface WebhookStats {
  last_at: string | null;
  count_24h: number;
  count_7d: number;
  failed_24h?: number;
  last_failure_at?: string | null;
  last_failure_error?: string | null;
}

export interface RecentSyncEvent {
  at: string;
  kind: SyncKind;
  status: string;
  name?: string | null;
  action?: string | null;
  added?: number;
  updated?: number;
  removed?: number;
  failed?: number;
  error?: string | null;
}

export interface PricelistSyncStatus {
  backfill?: SyncRunStats | null;
  manual?: SyncRunStats | null;
  cron?: SyncRunStats | null;
  webhook?: WebhookStats | null;
  recent?: RecentSyncEvent[];
  cron_schedule?: string | null;
}

const KIND_LABEL: Record<SyncKind, string> = {
  manual: 'Manual sync',
  cron: 'Scheduled sync',
  webhook: 'Webhook sync',
};

const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString() : '—');

function isFailure(status?: string | null) {
  return status === 'error' || status === 'failed';
}

function RunSummary({ kind, run }: { kind: SyncKind; run: SyncRunStats }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/60 p-2.5 text-xs space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{KIND_LABEL[kind]}</span>
        <span className="text-muted-foreground tabular-nums">{fmt(run.at)}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
        <span><span className="font-semibold text-emerald-600">{run.added ?? 0}</span> added</span>
        <span><span className="font-semibold text-blue-600">{run.updated ?? 0}</span> updated</span>
        <span><span className="font-semibold text-red-600">{run.removed ?? 0}</span> removed</span>
        {!!run.skipped && <span><span className="font-semibold">{run.skipped}</span> skipped</span>}
        <span className={run.failed ? 'text-destructive' : ''}>
          <span className="font-semibold">{run.failed ?? 0}</span> failed
        </span>
      </div>
      {(run.error || isFailure(run.status)) && (
        <div className="flex items-start gap-1.5 text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span className="break-words">{run.error || `Sync reported status "${run.status}"`}</span>
        </div>
      )}
    </div>
  );
}

export function PricelistSyncPanel({
  status,
  jobLogsUrl,
}: {
  status: PricelistSyncStatus | null;
  jobLogsUrl?: string;
}) {
  const [filter, setFilter] = useState<SyncKind | 'all'>('all');

  const recent = useMemo(
    () => (status?.recent ?? []).filter((e) => filter === 'all' || e.kind === filter),
    [status?.recent, filter],
  );

  const next = useMemo(() => nextCronRun(status?.cron_schedule), [status?.cron_schedule]);
  const webhook = status?.webhook;

  if (!status) return null;

  return (
    <section className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <RefreshCw className="h-4 w-4" /> Sync activity
        </h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          Next scheduled reconcile:{' '}
          <span className="font-medium text-foreground">{next ? next.toLocaleString() : 'not scheduled'}</span>
          {jobLogsUrl && (
            <Button asChild variant="ghost" size="sm" className="h-6 px-1.5 text-[11px] gap-1">
              <a href={jobLogsUrl} target="_blank" rel="noreferrer">
                Job logs <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {status.manual && <RunSummary kind="manual" run={status.manual} />}
        {status.cron && <RunSummary kind="cron" run={status.cron} />}
        {webhook && (
          <div className="rounded-md border border-border/60 bg-background/60 p-2.5 text-xs space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">Webhook sync</span>
              <span className="text-muted-foreground tabular-nums">{fmt(webhook.last_at)}</span>
            </div>
            <div className="flex flex-wrap gap-x-3 text-muted-foreground">
              <span><span className="font-semibold text-blue-600">{webhook.count_24h}</span> in 24h</span>
              <span><span className="font-semibold">{webhook.count_7d}</span> in 7d</span>
              <span className={webhook.failed_24h ? 'text-destructive' : ''}>
                <span className="font-semibold">{webhook.failed_24h ?? 0}</span> failed (24h)
              </span>
            </div>
            {webhook.last_failure_at && (
              <div className="flex items-start gap-1.5 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span className="break-words">
                  {webhook.last_failure_error || 'Webhook event failed'} · {fmt(webhook.last_failure_at)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(['all', 'manual', 'cron', 'webhook'] as const).map((k) => (
          <Button
            key={k}
            type="button"
            size="sm"
            variant={filter === k ? 'default' : 'outline'}
            className="h-6 rounded-full px-2.5 text-[11px]"
            onClick={() => setFilter(k)}
          >
            {k === 'all' ? 'All' : KIND_LABEL[k]}
          </Button>
        ))}
      </div>

      <ul className="max-h-56 overflow-y-auto divide-y divide-border/50 rounded-md border border-border/50">
        {recent.length === 0 && (
          <li className="px-2.5 py-4 text-xs text-muted-foreground text-center">No sync events recorded.</li>
        )}
        {recent.map((e, i) => (
          <li key={`${e.at}-${i}`} className="px-2.5 py-1.5 text-xs flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className="h-4 px-1 text-[10px]">{KIND_LABEL[e.kind]}</Badge>
                <Badge
                  variant="outline"
                  className={`h-4 px-1 text-[10px] ${
                    isFailure(e.status)
                      ? 'border-destructive/40 text-destructive'
                      : 'border-emerald-500/40 text-emerald-600'
                  }`}
                >
                  {e.status}
                </Badge>
                <span className="truncate text-muted-foreground max-w-[240px]">
                  {e.name || (e.kind === 'webhook' ? 'Product update' : `${e.added ?? 0} added · ${e.updated ?? 0} updated · ${e.removed ?? 0} removed`)}
                </span>
              </div>
              {e.error && <div className="text-destructive break-words">{e.error}</div>}
            </div>
            <span className="text-muted-foreground tabular-nums whitespace-nowrap flex items-center gap-1">
              <Clock className="h-3 w-3" />{fmt(e.at)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
