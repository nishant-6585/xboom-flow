import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PipelineOrder, PIPELINE_LOST_REASONS } from '@/hooks/usePipelineOrders';
import { format, startOfDay, startOfWeek, startOfMonth, endOfDay, endOfWeek, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { TrendingUp, TrendingDown, CalendarDays, Users, Package, IndianRupee } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PipelineStatusDashboardProps {
  orders: PipelineOrder[];
  status: 'won' | 'lost';
}

type Period = 'today' | 'this_week' | 'this_month';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  this_week: 'This Week',
  this_month: 'This Month',
};

const formatCurrency = (value: number) => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value.toFixed(0)}`;
};

function getRange(period: Period) {
  const now = new Date();
  switch (period) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'this_week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'this_month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
}

type DetailView = 
  | { type: 'total'; title: string }
  | { type: 'salesPerson'; name: string; title: string }
  | { type: 'category'; category: string; title: string }
  | { type: 'lostReason'; reason: string; title: string };

export function PipelineStatusDashboard({ orders, status }: PipelineStatusDashboardProps) {
  const [period, setPeriod] = useState<Period>('this_month');
  const [detailView, setDetailView] = useState<DetailView | null>(null);
  const isWon = status === 'won';

  // For 'Won' summary, source data from the actual `orders` table (excluding
  // website orders, per analytics scope policy) so the numbers match the real
  // order book. For 'Lost' we keep using pipeline_orders since lost deals only
  // live there.
  const range = getRange(period);
  const wonOrdersQuery = useQuery({
    queryKey: ['pipeline-status-dashboard-won-orders', range.start.toISOString(), range.end.toISOString()],
    enabled: isWon,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, customer_name, customer_company, product_name, product_category, quantity, total_sales_amount, selling_price, sales_person_id, sales_person_name, order_date, created_at, updated_at, source')
        .gte('order_date', range.start.toISOString().slice(0, 10))
        .lte('order_date', range.end.toISOString().slice(0, 10))
        .or('source.is.null,source.neq.website');
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (isWon) {
      const rows = wonOrdersQuery.data ?? [];
      return rows.map((o: any) => ({
        id: o.id,
        customer_name: o.customer_name,
        customer_company: o.customer_company,
        product_name: o.product_name,
        product_category: o.product_category,
        quantity: o.quantity ?? 1,
        expected_price: Number(o.total_sales_amount ?? o.selling_price ?? 0),
        sales_person_id: o.sales_person_id ?? 'unassigned',
        sales_person_name: o.sales_person_name || 'Unassigned',
        status: 'won',
        created_at: o.created_at,
        updated_at: o.order_date || o.updated_at || o.created_at,
      })) as unknown as PipelineOrder[];
    }
    const range = getRange(period);
    return orders.filter(o => {
      if (o.status !== status) return false;
      const dateStr = o.updated_at || o.created_at;
      if (!dateStr) return false;
      try {
        return isWithinInterval(parseISO(dateStr), range);
      } catch {
        return false;
      }
    });
  }, [orders, status, period, isWon, wonOrdersQuery.data]);

  const totalValue = filtered.reduce((s, o) => s + (o.expected_price || 0), 0);
  const totalDeals = filtered.length;

  const bySalesPerson = useMemo(() => {
    const map = new Map<string, { name: string; id: string; count: number; total: number }>();
    filtered.forEach(o => {
      const k = o.sales_person_id;
      if (!map.has(k)) map.set(k, { name: o.sales_person_name || 'Unassigned', id: k, count: 0, total: 0 });
      const e = map.get(k)!;
      e.count++;
      e.total += o.expected_price || 0;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const byCategory = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    filtered.forEach(o => {
      const cat = o.product_category || 'Uncategorized';
      if (!map.has(cat)) map.set(cat, { count: 0, total: 0 });
      const e = map.get(cat)!;
      e.count++;
      e.total += o.expected_price || 0;
    });
    return Array.from(map.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  const lostReasonBreakdown = useMemo(() => {
    if (isWon) return [];
    const map = new Map<string, number>();
    filtered.forEach(o => {
      const reason = o.lost_reason || 'not_specified';
      map.set(reason, (map.get(reason) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([reason, count]) => ({
        reason,
        label: PIPELINE_LOST_REASONS.find(r => r.value === reason)?.label || 'Not specified',
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filtered, isWon]);

  // Get detail orders based on current detailView
  const detailOrders = useMemo(() => {
    if (!detailView) return [];
    switch (detailView.type) {
      case 'total':
        return filtered;
      case 'salesPerson':
        return filtered.filter(o => o.sales_person_name === detailView.name);
      case 'category':
        return filtered.filter(o => (o.product_category || 'Uncategorized') === detailView.category);
      case 'lostReason':
        return filtered.filter(o => (o.lost_reason || 'not_specified') === detailView.reason);
    }
  }, [detailView, filtered]);

  const borderColor = isWon ? 'border-green-200 dark:border-green-800' : 'border-red-200 dark:border-red-800';
  const bgColor = isWon ? 'bg-green-50/30 dark:bg-green-950/10' : 'bg-red-50/30 dark:bg-red-950/10';
  const textColor = isWon ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400';
  const Icon = isWon ? TrendingUp : TrendingDown;

  return (
    <div className="space-y-4 mb-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Icon className={`w-5 h-5 ${textColor}`} />
          {isWon ? 'Orders Won' : 'Orders Lost'} Summary
        </h3>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[140px]">
            <CalendarDays className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total */}
        <Card 
          className={`${borderColor} ${bgColor} cursor-pointer hover:shadow-md transition-shadow`}
          onClick={() => setDetailView({ type: 'total', title: `${PERIOD_LABELS[period]} — All ${isWon ? 'Won' : 'Lost'} Orders` })}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {PERIOD_LABELS[period]} — Total Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${textColor}`}>{formatCurrency(totalValue)}</div>
            <p className="text-sm text-muted-foreground mt-1">{totalDeals} deal{totalDeals !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>

        {/* By Sales Person */}
        <Card className={`${borderColor} ${bgColor}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              By Sales Person
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {bySalesPerson.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No data</p>
            ) : (
              bySalesPerson.slice(0, 5).map(sp => (
                <div 
                  key={sp.name} 
                  className="flex items-center justify-between text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors"
                  onClick={() => setDetailView({ type: 'salesPerson', name: sp.name, title: `${sp.name} — ${isWon ? 'Won' : 'Lost'} Orders` })}
                >
                  <span className="text-muted-foreground truncate mr-2">{sp.name.split(' ')[0]}</span>
                  <span className="font-medium whitespace-nowrap">{sp.count} — {formatCurrency(sp.total)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* By Category / Lost Reasons */}
        <Card className={`${borderColor} ${bgColor}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" />
              {isWon ? 'By Category' : 'Lost Reasons'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {isWon ? (
              byCategory.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No data</p>
              ) : (
                byCategory.slice(0, 5).map(cat => (
                  <div 
                    key={cat.category} 
                    className="flex items-center justify-between text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors"
                    onClick={() => setDetailView({ type: 'category', category: cat.category, title: `${cat.category} — ${isWon ? 'Won' : 'Lost'} Orders` })}
                  >
                    <span className="text-muted-foreground truncate mr-2">{cat.category}</span>
                    <span className="font-medium whitespace-nowrap">{cat.count} — {formatCurrency(cat.total)}</span>
                  </div>
                ))
              )
            ) : (
              lostReasonBreakdown.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No data</p>
              ) : (
                lostReasonBreakdown.slice(0, 5).map(r => (
                  <div 
                    key={r.reason} 
                    className="flex items-center justify-between text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors"
                    onClick={() => setDetailView({ type: 'lostReason', reason: r.reason, title: `Lost Reason: ${r.label}` })}
                  >
                    <span className="text-muted-foreground truncate mr-2">{r.label}</span>
                    <Badge variant="outline" className="text-xs">{r.count}</Badge>
                  </div>
                ))
              )
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailView} onOpenChange={(open) => !open && setDetailView(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{detailView?.title}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Expected Price</TableHead>
                  <TableHead>Sales Person</TableHead>
                  {!isWon && <TableHead>Lost Reason</TableHead>}
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isWon ? 6 : 7} className="text-center py-8 text-muted-foreground">
                      No orders found
                    </TableCell>
                  </TableRow>
                ) : (
                  detailOrders.map(order => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{order.customer_name}</div>
                          <div className="text-xs text-muted-foreground">{order.customer_company}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{order.product_name}</div>
                          <div className="text-xs text-muted-foreground">{order.product_category}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{order.quantity}</TableCell>
                      <TableCell className="text-right">
                        {order.expected_price ? (
                          <span className="flex items-center justify-end gap-0.5">
                            <IndianRupee className="h-3 w-3" />
                            {order.expected_price.toLocaleString('en-IN')}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>{order.sales_person_name}</TableCell>
                      {!isWon && (
                        <TableCell>
                          <div className="text-sm">
                            <div>{PIPELINE_LOST_REASONS.find(r => r.value === order.lost_reason)?.label || '—'}</div>
                            {order.lost_reason_notes && (
                              <div className="text-xs text-muted-foreground truncate max-w-[150px]" title={order.lost_reason_notes}>
                                {order.lost_reason_notes}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {format(parseISO(order.updated_at || order.created_at), 'dd MMM yyyy')}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
