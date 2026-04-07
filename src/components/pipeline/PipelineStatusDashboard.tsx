import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PipelineOrder, PIPELINE_LOST_REASONS } from '@/hooks/usePipelineOrders';
import { format, startOfDay, startOfWeek, startOfMonth, endOfDay, endOfWeek, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { TrendingUp, TrendingDown, CalendarDays, Users, Package } from 'lucide-react';

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

export function PipelineStatusDashboard({ orders, status }: PipelineStatusDashboardProps) {
  const [period, setPeriod] = useState<Period>('this_month');
  const isWon = status === 'won';

  const filtered = useMemo(() => {
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
  }, [orders, status, period]);

  const totalValue = filtered.reduce((s, o) => s + (o.expected_price || 0), 0);
  const totalDeals = filtered.length;

  const bySalesPerson = useMemo(() => {
    const map = new Map<string, { name: string; count: number; total: number }>();
    filtered.forEach(o => {
      const k = o.sales_person_id;
      if (!map.has(k)) map.set(k, { name: o.sales_person_name || 'Unassigned', count: 0, total: 0 });
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
        <Card className={`${borderColor} ${bgColor}`}>
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
                <div key={sp.name} className="flex items-center justify-between text-sm">
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
                  <div key={cat.category} className="flex items-center justify-between text-sm">
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
                  <div key={r.reason} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground truncate mr-2">{r.label}</span>
                    <Badge variant="outline" className="text-xs">{r.count}</Badge>
                  </div>
                ))
              )
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
