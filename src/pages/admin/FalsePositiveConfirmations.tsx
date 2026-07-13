import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import AdminTabsNav from '@/components/admin/AdminTabsNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ActionWithCommentDialog } from '@/components/admin/ActionWithCommentDialog';
import { toast } from 'sonner';
import { ShieldCheck, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

type FlaggedOrder = {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  product_name: string | null;
  source: string | null;
  created_at: string;
  confirmation_status: string | null;
};

type ClearedEvent = {
  id: string;
  entity_id: string;
  created_at: string;
  payload: Record<string, any>;
};

type ClearRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  cleared_count: number;
  skipped_count: number;
  error_count: number;
  triggered_by: string;
};

function fmt(ts: string | null | undefined) {
  if (!ts) return '—';
  try { return format(new Date(ts), 'dd MMM yyyy HH:mm'); } catch { return ts as string; }
}

export default function FalsePositiveConfirmations() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'flagged' | 'cleared' | 'runs'>('flagged');

  const flagged = useQuery({
    queryKey: ['fp-flagged'],
    queryFn: async (): Promise<FlaggedOrder[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, customer_email, product_name, source, created_at, confirmation_status')
        .eq('requires_confirmation', true)
        .in('confirmation_status', ['pending', 'not_sent'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as FlaggedOrder[];
    },
  });

  const cleared = useQuery({
    queryKey: ['fp-cleared'],
    queryFn: async (): Promise<ClearedEvent[]> => {
      const { data, error } = await supabase
        .from('domain_events')
        .select('id, entity_id, created_at, payload')
        .eq('event_type', 'order.confirmation_flag_cleared_false_positive')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ClearedEvent[];
    },
  });

  const runs = useQuery({
    queryKey: ['fp-runs'],
    queryFn: async (): Promise<ClearRun[]> => {
      const { data, error } = await supabase
        .from('false_positive_clear_runs')
        .select('id, started_at, finished_at, cleared_count, skipped_count, error_count, triggered_by')
        .order('started_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ClearRun[];
    },
  });

  const clearOne = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      const { error } = await supabase.rpc('clear_order_confirmation_flag_manual', {
        p_order_id: orderId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Confirmation flag cleared');
      qc.invalidateQueries({ queryKey: ['fp-flagged'] });
      qc.invalidateQueries({ queryKey: ['fp-cleared'] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to clear flag'),
  });

  const runNow = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('clear_false_positive_confirmation_flags', {
        p_triggered_by: 'manual_admin_ui',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Cleaner run completed');
      qc.invalidateQueries({ queryKey: ['fp-flagged'] });
      qc.invalidateQueries({ queryKey: ['fp-cleared'] });
      qc.invalidateQueries({ queryKey: ['fp-runs'] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Run failed'),
  });

  return (
    <div className="min-h-screen bg-background">
      <AdminTabsNav active="false-positive-confirmations" />
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold">False-Positive Confirmations</h1>
          </div>
          <Button onClick={() => runNow.mutate()} disabled={runNow.isPending} variant="outline" size="sm">
            {runNow.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Run cleaner now
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="flagged">Currently flagged ({flagged.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="cleared">Cleared history</TabsTrigger>
            <TabsTrigger value="runs">Cron runs</TabsTrigger>
          </TabsList>

          <TabsContent value="flagged">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Orders awaiting customer confirmation</CardTitle>
              </CardHeader>
              <CardContent>
                {flagged.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading…</div>
                ) : (flagged.data?.length ?? 0) === 0 ? (
                  <div className="text-sm text-muted-foreground">No flagged orders.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {flagged.data!.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell>
                            <Link to={`/orders?highlight=${o.id}`} className="text-primary hover:underline inline-flex items-center gap-1">
                              {o.order_number || o.id.slice(0, 8)}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div>{o.customer_name || '—'}</div>
                            <div className="text-xs text-muted-foreground">{o.customer_email || ''}</div>
                          </TableCell>
                          <TableCell className="text-sm">{o.product_name || '—'}</TableCell>
                          <TableCell><Badge variant="outline">{o.source || '—'}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmt(o.created_at)}</TableCell>
                          <TableCell className="text-right">
                            <ActionWithCommentDialog
                              trigger={<Button size="sm" variant="destructive">Clear flag</Button>}
                              title="Clear confirmation flag"
                              description={`Mark order ${o.order_number || o.id.slice(0, 8)} as a false positive. This will suppress the customer confirmation email and log an audit entry.`}
                              confirmLabel="Clear flag"
                              confirmVariant="destructive"
                              loading={clearOne.isPending}
                              onConfirm={(reason) => clearOne.mutate({ orderId: o.id, reason })}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cleared">
            <Card>
              <CardHeader><CardTitle className="text-base">Recently cleared</CardTitle></CardHeader>
              <CardContent>
                {cleared.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading…</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cleared at</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Cleared by</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Run</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cleared.data?.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-xs">{fmt(e.created_at)}</TableCell>
                          <TableCell>
                            <Link to={`/orders?highlight=${e.entity_id}`} className="text-primary hover:underline">
                              {e.payload?.order_number || e.entity_id.slice(0, 8)}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">
                            <Badge variant="outline">{e.payload?.cleared_by || '—'}</Badge>
                            {e.payload?.cleared_by_name && (
                              <div className="text-xs text-muted-foreground">{e.payload.cleared_by_name}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs max-w-md truncate">{e.payload?.reason || '—'}</TableCell>
                          <TableCell className="text-xs">
                            {e.payload?.run_id ? (
                              <button
                                onClick={() => setTab('runs')}
                                className="text-primary hover:underline"
                              >{String(e.payload.run_id).slice(0, 8)}</button>
                            ) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="runs">
            <Card>
              <CardHeader><CardTitle className="text-base">Last 50 cleaner runs</CardTitle></CardHeader>
              <CardContent>
                {runs.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading…</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Started</TableHead>
                        <TableHead>Finished</TableHead>
                        <TableHead>Triggered by</TableHead>
                        <TableHead className="text-right">Cleared</TableHead>
                        <TableHead className="text-right">Skipped</TableHead>
                        <TableHead className="text-right">Errors</TableHead>
                        <TableHead>Domain events</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.data?.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs">{fmt(r.started_at)}</TableCell>
                          <TableCell className="text-xs">{fmt(r.finished_at)}</TableCell>
                          <TableCell><Badge variant="outline">{r.triggered_by}</Badge></TableCell>
                          <TableCell className="text-right font-medium">{r.cleared_count}</TableCell>
                          <TableCell className="text-right">{r.skipped_count}</TableCell>
                          <TableCell className={`text-right ${r.error_count > 0 ? 'text-destructive font-medium' : ''}`}>{r.error_count}</TableCell>
                          <TableCell>
                            {r.cleared_count > 0 ? (
                              <button
                                onClick={() => setTab('cleared')}
                                className="text-primary hover:underline text-xs inline-flex items-center gap-1"
                              >View events <ExternalLink className="h-3 w-3" /></button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}