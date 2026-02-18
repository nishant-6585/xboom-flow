import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShoppingBag, Clock, AlertTriangle, CheckCircle2, RefreshCw, Loader2, Package } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface PipelineStats {
  todayOrders: number;
  pendingRaw: number;
  failedOrders: number;
  lastProcessedAt: string | null;
}

export function ShopifyPipelineWidget() {
  const [stats, setStats] = useState<PipelineStats>({
    todayOrders: 0,
    pendingRaw: 0,
    failedOrders: 0,
    lastProcessedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [todayRes, pendingRes, failedRes, lastRes] = await Promise.all([
        supabase
          .from('shopify_orders')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
        supabase
          .from('shopify_orders_raw')
          .select('id', { count: 'exact', head: true })
          .eq('processing_status', 'pending'),
        supabase
          .from('shopify_orders_raw')
          .select('id', { count: 'exact', head: true })
          .eq('processing_status', 'failed'),
        supabase
          .from('shopify_orders_raw')
          .select('processed_at')
          .eq('processing_status', 'completed')
          .order('processed_at', { ascending: false })
          .limit(1),
      ]);

      setStats({
        todayOrders: todayRes.count ?? 0,
        pendingRaw: pendingRes.count ?? 0,
        failedOrders: failedRes.count ?? 0,
        lastProcessedAt: lastRes.data?.[0]?.processed_at ?? null,
      });
    } catch (e) {
      console.error('Failed to fetch Shopify pipeline stats', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Refresh every 2 minutes to stay in sync with pg_cron processor
    const interval = setInterval(() => fetchStats(true), 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const tiles = [
    {
      label: 'Orders Today',
      value: stats.todayOrders,
      icon: ShoppingBag,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-500/10',
      badge: null,
    },
    {
      label: 'Pending in Queue',
      value: stats.pendingRaw,
      icon: Clock,
      color: stats.pendingRaw > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
      bg: stats.pendingRaw > 0 ? 'bg-amber-500/10' : 'bg-muted/30',
      badge: stats.pendingRaw > 0 ? 'warn' : null,
    },
    {
      label: 'Failed Orders',
      value: stats.failedOrders,
      icon: AlertTriangle,
      color: stats.failedOrders > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
      bg: stats.failedOrders > 0 ? 'bg-red-500/10' : 'bg-muted/30',
      badge: stats.failedOrders > 0 ? 'error' : null,
    },
  ] as const;

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
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {tiles.map((tile) => (
                <div
                  key={tile.label}
                  className={`rounded-xl p-3 ${tile.bg} flex flex-col gap-1.5 relative`}
                >
                  {tile.badge === 'error' && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                  {tile.badge === 'warn' && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  )}
                  <tile.icon className={`h-4 w-4 ${tile.color}`} />
                  <p className={`text-2xl font-bold ${tile.color}`}>{tile.value}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{tile.label}</p>
                </div>
              ))}
            </div>

            {/* Last successful processing */}
            <div className="flex items-center gap-2 pt-1 border-t border-border/40">
              {stats.lastProcessedAt ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    Last processed{' '}
                    <span className="font-medium text-foreground">
                      {formatDistanceToNow(new Date(stats.lastProcessedAt), { addSuffix: true })}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">No processed orders yet</span>
                </>
              )}

              {stats.failedOrders > 0 && (
                <Badge variant="destructive" className="ml-auto text-xs h-5 px-2">
                  {stats.failedOrders} failed
                </Badge>
              )}
              {stats.pendingRaw > 0 && stats.failedOrders === 0 && (
                <Badge variant="secondary" className="ml-auto text-xs h-5 px-2 bg-amber-500/15 text-amber-700 dark:text-amber-400">
                  {stats.pendingRaw} queued
                </Badge>
              )}
              {stats.failedOrders === 0 && stats.pendingRaw === 0 && (
                <Badge variant="secondary" className="ml-auto text-xs h-5 px-2 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                  All clear
                </Badge>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
