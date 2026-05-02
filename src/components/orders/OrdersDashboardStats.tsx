import { useMemo, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  IndianRupee, TrendingUp, TrendingDown, Package, CheckCircle2, Calendar, User, Clock,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, format, isWithinInterval, startOfDay,
} from "date-fns";
import { Order } from "@/hooks/useOrders";
import { supabase } from "@/integrations/supabase/client";
import { useAnalyticsScope, filterByAnalyticsScope } from "@/contexts/AnalyticsScopeContext";
import { IncludeWebsiteToggle } from "@/components/analytics/IncludeWebsiteToggle";

type TimePeriod = "this_week" | "this_month" | "prev_month";

interface OrdersDashboardStatsProps {
  orders: Order[];
  timePeriod: TimePeriod;
  onTimePeriodChange: (v: TimePeriod) => void;
  salesPersonFilter: string;
  onSalesPersonFilterChange: (v: string) => void;
}

const fmt = (v: number) => {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toLocaleString("en-IN")}`;
};

function getDateRange(period: TimePeriod): { start: Date; end: Date } {
  const now = new Date();
  switch (period) {
    case "this_week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "this_month":
      return { start: startOfMonth(now), end: now };
    case "prev_month": {
      const prev = subMonths(now, 1);
      return { start: startOfMonth(prev), end: endOfMonth(prev) };
    }
  }
}

export function OrdersDashboardStats({
  orders,
  timePeriod,
  onTimePeriodChange,
  salesPersonFilter,
  onSalesPersonFilterChange,
}: OrdersDashboardStatsProps) {
  const { includeWebsite } = useAnalyticsScope();

  // Scope all dashboard math to the analytics-scope toggle. Operational order
  // lists elsewhere are unaffected — only this dashboard filters.
  const scopedOrders = useMemo(
    () => filterByAnalyticsScope(orders, includeWebsite),
    [orders, includeWebsite],
  );

  const salesPersons = useMemo(() => {
    const names = new Set<string>();
    scopedOrders.forEach((o) => { if (o.sales_person_name) names.add(o.sales_person_name); });
    return Array.from(names).sort();
  }, [scopedOrders]);

  const filteredOrders = useMemo(() => {
    const { start, end } = getDateRange(timePeriod);
    return scopedOrders.filter((o) => {
      if (o.status === "cancelled") return false;
      const d = new Date(o.order_date || o.created_at);
      const inRange = isWithinInterval(d, { start: startOfDay(start), end });
      const matchesPerson = salesPersonFilter === "all" || o.sales_person_name === salesPersonFilter;
      return inRange && matchesPerson;
    });
  }, [scopedOrders, timePeriod, salesPersonFilter]);

  // Fetch profit data from order_items via DB function
  const [profitData, setProfitData] = useState<Record<string, { profit: number; total_sales: number }>>({});
  
  useEffect(() => {
    const orderIds = filteredOrders.map(o => o.id);
    if (orderIds.length === 0) {
      setProfitData({});
      return;
    }
    
    const fetchProfits = async () => {
      const { data, error } = await supabase.rpc('get_order_profits', {
        p_order_ids: orderIds,
        p_include_website: includeWebsite,
      });
      if (!error && data) {
        const map: Record<string, { profit: number; total_sales: number }> = {};
        (data as any[]).forEach((row: any) => {
          map[row.order_id] = { profit: Number(row.profit) || 0, total_sales: Number(row.total_sales) || 0 };
        });
        setProfitData(map);
      }
    };
    fetchProfits();
  }, [filteredOrders, includeWebsite]);

  const totals = useMemo(() => {
    const totalOrders = filteredOrders.length;
    const totalOrderValue = filteredOrders.reduce((s, o) => s + (o.total_sales_amount || 0), 0);
    const totalReceived = filteredOrders.reduce((s, o) => s + (o.amount_paid || 0), 0);
    const totalPending = totalOrderValue - totalReceived;
    
    // Calculate profit from order_items data
    let totalProfit = 0;
    let totalRevenue = 0;
    Object.values(profitData).forEach(({ profit, total_sales }) => {
      totalProfit += profit;
      totalRevenue += total_sales;
    });
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    return { totalOrders, totalOrderValue, totalReceived, totalPending, totalProfit, avgMargin };
  }, [filteredOrders, profitData]);

  // Comparison chart data
  const comparisonData = useMemo(() => {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const dayOfMonth = now.getDate();
    const prevMonthStart = startOfMonth(subMonths(now, 1));
    const days = Array.from({ length: dayOfMonth }, (_, i) => i + 1);

    return days.map((day) => {
      const currentDayOrders = scopedOrders.filter((o) => {
        if (o.status === "cancelled") return false;
        const d = new Date(o.order_date || o.created_at);
        return d.getDate() === day &&
          d.getMonth() === currentMonthStart.getMonth() &&
          d.getFullYear() === currentMonthStart.getFullYear() &&
          (salesPersonFilter === "all" || o.sales_person_name === salesPersonFilter);
      });
      const prevDayOrders = scopedOrders.filter((o) => {
        if (o.status === "cancelled") return false;
        const d = new Date(o.order_date || o.created_at);
        return d.getDate() === day &&
          d.getMonth() === prevMonthStart.getMonth() &&
          d.getFullYear() === prevMonthStart.getFullYear() &&
          (salesPersonFilter === "all" || o.sales_person_name === salesPersonFilter);
      });
      return {
        day: `${day}`,
        currentMonth: currentDayOrders.reduce((s, o) => s + (o.total_sales_amount || 0), 0),
        prevMonth: prevDayOrders.reduce((s, o) => s + (o.total_sales_amount || 0), 0),
      };
    });
  }, [scopedOrders, salesPersonFilter]);

  const currentMonthLabel = format(new Date(), "MMM yyyy");
  const prevMonthLabel = format(subMonths(new Date(), 1), "MMM yyyy");
  const periodLabel = timePeriod === "this_week" ? "This Week" : timePeriod === "this_month" ? "Month Till Date" : "Previous Month";

  const formatChartValue = (value: number) => {
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
    return `₹${value}`;
  };

  const statCards = [
    { label: "Total Orders", value: String(totals.totalOrders), icon: Package, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Order Value", value: fmt(totals.totalOrderValue), icon: IndianRupee, color: "text-primary", bg: "bg-primary/10" },
    { label: "Received", value: fmt(totals.totalReceived), icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Pending", value: fmt(totals.totalPending), icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Profit", value: fmt(totals.totalProfit), icon: TrendingUp, color: totals.totalProfit >= 0 ? "text-emerald-500" : "text-rose-500", bg: totals.totalProfit >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10" },
    { label: "Avg Margin", value: `${totals.avgMargin.toFixed(1)}%`, icon: TrendingDown, color: totals.avgMargin >= 0 ? "text-primary" : "text-rose-500", bg: totals.avgMargin >= 0 ? "bg-primary/10" : "bg-rose-500/10" },
  ];

  return (
    <div className="space-y-5 mb-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Select value={timePeriod} onValueChange={(v) => onTimePeriodChange(v as TimePeriod)}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="prev_month">Previous Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" />
          <Select value={salesPersonFilter} onValueChange={onSalesPersonFilterChange}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="All Salespersons" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Salespersons</SelectItem>
              {salesPersons.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Badge variant="outline" className="text-xs">
          {periodLabel} · {filteredOrders.length} orders
        </Badge>
        <div className="sm:ml-auto">
          <IncludeWebsiteToggle />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((s) => (
          <Card key={s.label} className="border border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <div className={`p-1.5 rounded-md ${s.bg}`}>
                  <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-bold">{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{periodLabel}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Comparison Chart */}
      <Card className="border border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Sales Comparison: {currentMonthLabel} vs {prevMonthLabel}
          </CardTitle>
          <p className="text-xs text-muted-foreground">Day-wise order value comparison (till date)</p>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] sm:h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                  interval={Math.max(0, Math.floor(comparisonData.length / 10) - 1)}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                  tickFormatter={formatChartValue}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-sm">
                        <p className="font-medium mb-2">Day {label}</p>
                        {payload.map((entry: any, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: entry.color }} />
                            <span className="text-muted-foreground">{entry.name}:</span>
                            <span className="font-medium">{fmt(entry.value)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} iconType="square" iconSize={10} />
                <Bar dataKey="currentMonth" name={currentMonthLabel} fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} maxBarSize={20} />
                <Bar dataKey="prevMonth" name={prevMonthLabel} fill="hsl(var(--muted-foreground))" opacity={0.5} radius={[3, 3, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
