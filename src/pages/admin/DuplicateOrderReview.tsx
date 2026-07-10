import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import AdminTabsNav from '@/components/admin/AdminTabsNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';

type Row = {
  id: string;
  website_order_id: string;
  manual_order_id: string;
  match_reasons: string[];
  amount_diff: number | null;
  payment_records_on_manual: number;
  status: 'pending_review' | 'approved' | 'rejected' | 'merged';
  decided_at: string | null;
  created_at: string;
  website_order: {
    id: string; order_number: string | null; source: string | null;
    sales_person_name: string | null; total_sales_amount: number | null;
    order_date: string | null; customer_name: string | null; product_name: string | null;
  } | null;
  manual_order: {
    id: string; order_number: string | null; source: string | null;
    sales_person_name: string | null; total_sales_amount: number | null;
    order_date: string | null; customer_name: string | null; product_name: string | null;
  } | null;
};

function money(n: number | null | undefined) {
  if (n == null) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function OrderCard({ o, tag }: { o: Row['website_order']; tag: 'Website' | 'Manual' }) {
  if (!o) return <div className="text-sm text-muted-foreground">Order missing</div>;
  return (
    <div className="rounded-lg border p-3 bg-card text-sm space-y-1">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{o.order_number || o.id.slice(0, 8)}</span>
        <Badge variant={tag === 'Website' ? 'secondary' : 'outline'}>{tag}</Badge>
        <Link to={`/orders?tab=list&highlight=${o.id}`} className="ml-auto text-xs text-primary hover:underline inline-flex items-center gap-1">
          View <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <div className="text-muted-foreground text-xs">Customer: <span className="text-foreground">{o.customer_name || '—'}</span></div>
      <div className="text-muted-foreground text-xs">Product: <span className="text-foreground">{o.product_name || '—'}</span></div>
      <div className="text-muted-foreground text-xs">Salesperson: <span className="text-foreground">{o.sales_person_name || '—'}</span></div>
      <div className="text-muted-foreground text-xs">Amount: <span className="text-foreground">{money(o.total_sales_amount)}</span> · Date: <span className="text-foreground">{o.order_date || '—'}</span></div>
    </div>
  );
}

export default function DuplicateOrderReview() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'pending_review' | 'approved' | 'rejected' | 'all'>('pending_review');

  const { data, isLoading } = useQuery({
    queryKey: ['order-duplicate-candidates', statusFilter],
    queryFn: async (): Promise<Row[]> => {
      let q = supabase
        .from('order_duplicate_candidates' as any)
        .select(`
          id, website_order_id, manual_order_id, match_reasons, amount_diff,
          payment_records_on_manual, status, decided_at, created_at,
          website_order:orders!order_duplicate_candidates_website_order_id_fkey(id,order_number,source,sales_person_name,total_sales_amount,order_date,customer_name,product_name),
          manual_order:orders!order_duplicate_candidates_manual_order_id_fkey(id,order_number,source,sales_person_name,total_sales_amount,order_date,customer_name,product_name)
        `)
        .order('created_at', { ascending: false });
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => {
      const { error } = await supabase
        .from('order_duplicate_candidates' as any)
        .update({ status, decided_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      toast.success(v.status === 'approved' ? 'Marked as duplicate (approved for merge)' : 'Marked as not a duplicate');
      qc.invalidateQueries({ queryKey: ['order-duplicate-candidates'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to update'),
  });

  const counts = useMemo(() => {
    const rows = data ?? [];
    return {
      total: rows.length,
    };
  }, [data]);

  if (role !== 'admin') {
    return (
      <div className="container mx-auto p-6">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Admin access required.</CardContent></Card>
      </div>
    );
  }

  return (
    <div>
      <AdminTabsNav active="duplicate-orders" />
      <div className="container mx-auto p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Duplicate Orders review
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pairs where a website order and a manual order look like the same order (same customer, similar product, close date). Approving marks the pair for merge — the actual merge is executed in a separate step.
            </p>
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <TabsList>
                <TabsTrigger value="pending_review">Pending</TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
                <TabsTrigger value="rejected">Rejected</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="text-xs text-muted-foreground">{counts.total} candidate pair{counts.total === 1 ? '' : 's'}</div>
          </CardContent>
        </Card>

        {isLoading ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>
        ) : (data?.length ?? 0) === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">No candidates in this bucket.</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {data!.map((row) => (
              <Card key={row.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={row.status === 'pending_review' ? 'secondary' : row.status === 'approved' ? 'default' : 'outline'}>
                      {row.status.replace('_', ' ')}
                    </Badge>
                    {row.match_reasons?.map((r) => (
                      <Badge key={r} variant="outline" className="text-[10px] font-normal">{r}</Badge>
                    ))}
                    <span className="ml-auto text-xs text-muted-foreground">
                      Δ {money(row.amount_diff ?? 0)} · {row.payment_records_on_manual} payment record{row.payment_records_on_manual === 1 ? '' : 's'} on manual
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <OrderCard o={row.website_order} tag="Website" />
                    <OrderCard o={row.manual_order} tag="Manual" />
                  </div>
                  {row.status === 'pending_review' && (
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: row.id, status: 'rejected' })} className="gap-1">
                        <XCircle className="h-4 w-4" /> Not a duplicate
                      </Button>
                      <Button size="sm" onClick={() => decide.mutate({ id: row.id, status: 'approved' })} className="gap-1">
                        <CheckCircle2 className="h-4 w-4" /> Approve merge
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}