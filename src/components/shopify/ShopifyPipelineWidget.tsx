import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShoppingBag, Clock, AlertTriangle, CheckCircle2, RefreshCw, Loader2, Package, Activity, Hourglass } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface MonitorMetrics {
  pending_count: number;
  failed_count: number;
  processing_count: number;
  completed_count: number;
  last_processed_at: string | null;
  last_webhook_received_at: string | null;
  oldest_pending_age_seconds: number | null;
}

interface MonitorResponse {
  status: 'healthy' | 'degraded' | 'warning';
  metrics: MonitorMetrics;
  checked_at: string;
}

// Fallback: fetch orders count for a range (or today when no range given)
async function fetchRangeCount(start?: Date, end?: Date): Promise<number> {
  let q = supabase.from('shopify_orders').select('id', { count: 'exact', head: true });
  if (start) q = q.gte('created_at', new Date(start.setHours(0, 0, 0, 0)).toISOString());
  else if (!end) q = q.gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
  if (end) {
    const e = new Date(end); e.setHours(23, 59, 59, 999);
    q = q.lte('created_at', e.toISOString());
  }
  const { count } = await q;
  return count ?? 0;
}

export interface ShopifyPipelineWidgetProps {
  /** When either date is set, tiles labelled "Orders Today" switch to "Orders in Range" and reflect the filter. Queue counts stay global (queue is not filterable). */
  filterStartDate?: Date;
  filterEndDate?: Date;
  /** Optional: pre-computed filtered order count from the parent list (avoids an extra round-trip). */
  filteredCount?: number;
}

export function ShopifyPipelineWidget({ filterStartDate, filterEndDate, filteredCount }: ShopifyPipelineWidgetProps = {}) {
  const [monitor, setMonitor] = useState<MonitorResponse | null>(null);
  const [todayOrders, setTodayOrders] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const hasRange = !!(filterStartDate || filterEndDate);

  const fetchStats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setFetchError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/shopify-monitor`;

      const [monitorRes, today] = await Promise.all([
        fetch(url, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }),
        filteredCount != null && hasRange
          ? Promise.resolve(filteredCount)
          : fetchRangeCount(filterStartDate, filterEndDate),
      ]);

      if (!monitorRes.ok) {
        const err = await monitorRes.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${monitorRes.status}`);
      }

      const data: MonitorResponse = await monitorRes.json();
      setMonitor(data);
      setTodayOrders(today);
    } catch (e) {
      console.error('Failed to fetch Shopify monitor stats', e);
      setFetchError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => fetchStats(true), 2 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStartDate?.getTime(), filterEndDate?.getTime(), filteredCount]);

  const metrics = monitor?.metrics;
  const healthStatus = monitor?.status ?? 'healthy';

  const statusConfig = {
    healthy: { color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', label: 'Healthy', dot: 'bg-emerald-500' },
    warning: { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', label: 'Warning', dot: 'bg-amber-500' },
    degraded: { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10', label: 'Degraded', dot: 'bg-red-500' },
  };
  const sc = statusConfig[healthStatus];

  const tiles = [
    {
      label: hasRange ? 'Orders in Range' : 'Orders Today',
      value: todayOrders,
      icon: ShoppingBag,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-500/10',
      pulse: null,
    },
    {
      label: 'Pending in Queue',
      value: metrics?.pending_count ?? 0,
      icon: Clock,
      color: (metrics?.pending_count ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
      bg: (metrics?.pending_count ?? 0) > 0 ? 'bg-amber-500/10' : 'bg-muted/30',
      pulse: (metrics?.pending_count ?? 0) > 0 ? 'bg-amber-500' : null,
    },
    {
      label: 'Processing',
      value: metrics?.processing_count ?? 0,
      icon: Activity,
      color: (metrics?.processing_count ?? 0) > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground',
      bg: (metrics?.processing_count ?? 0) > 0 ? 'bg-blue-500/10' : 'bg-muted/30',
      pulse: (metrics?.processing_count ?? 0) > 0 ? 'bg-blue-500' : null,
    },
    {
      label: 'Failed Orders',
      value: metrics?.failed_count ?? 0,
      icon: AlertTriangle,
      color: (metrics?.failed_count ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
      bg: (metrics?.failed_count ?? 0) > 0 ? 'bg-red-500/10' : 'bg-muted/30',
      pulse: (metrics?.failed_count ?? 0) > 0 ? 'bg-red-500' : null,
    },
  ] as const;

  const formatAge = (seconds: number | null) => {
    if (seconds === null) return null;
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  return (
    <Card className="border border-border/60 shadow-sm bg-gradient-to-br from-card to-muted/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-green-500/10">
              <ShoppingBag className="h-4 w-4 text-green-600" />
            </div>
            <CardTitle className="text-sm font-semibold">Shopify Pipeline Monitor</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {!loading && monitor && (
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${sc.dot} ${healthStatus !== 'healthy' ? 'animate-pulse' : ''}`} />
                {sc.label}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchStats(true)}
              disabled={refreshing}
              className="h-7 w-7 p-0 rounded-lg"
              title="Refresh stats"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : fetchError ? (
          <div className="flex items-center gap-2 py-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{fetchError}</span>
          </div>
        ) : (
          <>
            {/* Metric tiles */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {tiles.map((tile) => (
                <div
                  key={tile.label}
                  className={`rounded-xl p-3 ${tile.bg} flex flex-col gap-1.5 relative`}
                >
                  {tile.pulse && (
                    <span className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full ${tile.pulse} animate-pulse`} />
                  )}
                  <tile.icon className={`h-4 w-4 ${tile.color}`} />
                  <p className={`text-2xl font-bold ${tile.color}`}>{tile.value}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{tile.label}</p>
                </div>
              ))}
            </div>

            {/* Oldest pending age */}
            {metrics && metrics.oldest_pending_age_seconds !== null && metrics.pending_count > 0 && (
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${metrics.oldest_pending_age_seconds > 600 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-muted/40 text-muted-foreground'}`}>
                <Hourglass className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Oldest pending order waiting{' '}
                  <span className="font-semibold">{formatAge(metrics.oldest_pending_age_seconds)}</span>
                  {metrics.oldest_pending_age_seconds > 600 && ' — exceeds 10 min threshold'}
                </span>
              </div>
            )}

            {/* Timestamps footer */}
            <div className="space-y-1.5 pt-1 border-t border-border/40">
              <div className="flex items-center gap-2">
                {metrics?.last_processed_at ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span className="text-xs text-muted-foreground">
                      Last processed{' '}
                      <span className="font-medium text-foreground">
                        {formatDistanceToNow(new Date(metrics.last_processed_at), { addSuffix: true })}
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">No processed orders yet</span>
                  </>
                )}

                {(metrics?.failed_count ?? 0) > 0 && (
                  <Badge variant="destructive" className="ml-auto text-xs h-5 px-2">
                    {metrics!.failed_count} failed
                  </Badge>
                )}
                {(metrics?.failed_count ?? 0) === 0 && (metrics?.pending_count ?? 0) === 0 && (
                  <Badge variant="secondary" className="ml-auto text-xs h-5 px-2 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                    All clear
                  </Badge>
                )}
              </div>

              {metrics?.last_webhook_received_at && (
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    Last webhook{' '}
                    <span className="font-medium text-foreground">
                      {formatDistanceToNow(new Date(metrics.last_webhook_received_at), { addSuffix: true })}
                    </span>
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {metrics.completed_count.toLocaleString()} total processed
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
