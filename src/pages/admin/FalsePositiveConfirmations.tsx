import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import AdminTabsNav from '@/components/admin/AdminTabsNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ExternalLink, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

type TriggerItem = {
  product_name: string | null;
  product_category: string | null;
  quantity: number | null;
};

type Row = {
  id: string;
  entity_id: string;
  created_at: string;
  payload: {
    order_number?: string | null;
    external_id?: string | null;
    customer_email?: string | null;
    customer_name?: string | null;
    source?: string | null;
    cleared_by?: string | null;
    reason?: string | null;
    triggering_items?: TriggerItem[] | null;
  };
};

export default function FalsePositiveConfirmations() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['false-positive-confirmations'],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from('domain_events')
        .select('id, entity_id, created_at, payload')
        .eq('event_type', 'order.confirmation_flag_cleared_false_positive')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <AdminTabsNav active="false-positive-confirmations" />
      <div className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-primary" />
              False-Positive Confirmations
            </h1>
            <p className="text-sm text-muted-foreground">
              Orders where the "requires confirmation" flag was cleared automatically because the items are not drones under the current detection rule.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !data || data.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No false-positive clears logged.</CardContent></Card>
        ) : (
          <div className="grid gap-3">
            {data.map((row) => {
              const items = row.payload.triggering_items ?? [];
              return (
                <Card key={row.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">
                        Order {row.payload.order_number || row.payload.external_id || row.entity_id.slice(0, 8)}
                      </span>
                      {row.payload.source && <Badge variant="outline">{row.payload.source}</Badge>}
                      <Badge variant="secondary">{row.payload.cleared_by || 'system'}</Badge>
                      <span className="ml-auto text-xs font-normal text-muted-foreground">
                        {format(new Date(row.created_at), 'dd MMM yyyy, HH:mm')}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Customer:</span> {row.payload.customer_name || '—'}</div>
                      <div><span className="text-muted-foreground">Email:</span> {row.payload.customer_email || '—'}</div>
                    </div>
                    {row.payload.reason && (
                      <div className="text-xs text-muted-foreground">Reason: {row.payload.reason}</div>
                    )}
                    {items.length > 0 && (
                      <div className="rounded-md border bg-muted/30 p-2">
                        <div className="text-xs font-medium mb-1">Triggering items ({items.length})</div>
                        <ul className="space-y-1">
                          {items.map((it, i) => (
                            <li key={i} className="text-xs flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{it.product_name || '—'}</span>
                              {it.product_category && (
                                <Badge variant="outline" className="text-[10px] h-4">{it.product_category}</Badge>
                              )}
                              {typeof it.quantity === 'number' && (
                                <span className="text-muted-foreground">× {it.quantity}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div>
                      <Link
                        to={`/orders?tab=list&highlight=${row.entity_id}`}
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        Open order <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}