import { useMemo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, format, isSameDay,
} from "date-fns";
import { Order } from "@/hooks/useOrders";
import { supabase } from "@/integrations/supabase/client";
import { isAnalyticsWebsite } from "@/lib/orderSource";

type TimePeriod = "this_week" | "this_month" | "prev_month";

interface OrdersDashboardStatsProps {
  orders: Order[];
  allOrders?: Order[];
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

const PERIOD_LABELS: Record<TimePeriod, string> = {
  this_week: "This week",
  this_month: "This month",
  prev_month: "Previous month",
};

type ProfitRow = { order_id: string; profit: number | string | null; total_sales: number | string | null };
type ChartPayloadItem = { color?: string; name?: string; value?: number | string };

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
  allOrders,
  timePeriod,
  onTimePeriodChange,
  salesPersonFilter,
  onSalesPersonFilterChange,
}: OrdersDashboardStatsProps) {
  // These cards should match the currently visible Orders list filters exactly.
  // Website (Auto) is controlled by the source filter, not by the global
  // analytics website toggle.
  const scopedOrders = orders;

  // For the month-vs-month comparison chart we want the full dataset, not the
  // user-filtered one, so the chart isn't blanked when filters narrow the period.
  const chartOrders = useMemo(
    () => allOrders ?? orders,
    [allOrders, orders],
  );

  const salesPersons = useMemo(() => {
    const names = new Set<string>();
    scopedOrders.forEach((o) => { if (o.sales_person_name) names.add(o.sales_person_name); });
    return Array.from(names).sort();
  }, [scopedOrders]);

  const filteredOrders = useMemo(() => {
    return scopedOrders.filter((o) => {
      const matchesPerson = salesPersonFilter === "all" || o.sales_person_name === salesPersonFilter;
      return matchesPerson;
    });
  }, [scopedOrders, salesPersonFilter]);

  // Fetch profit data from order_items via DB function
  const [profitData, setProfitData] = useState<Record<string, { profit: number; total_sales: number }>>({});
  const hasWebsiteRows = useMemo(
    () => filteredOrders.some((o) => isAnalyticsWebsite(o as any) || (o as any).source === 'website_auto'),
    [filteredOrders],
  );
  
  useEffect(() => {
    const orderIds = filteredOrders.map(o => o.id);
    if (orderIds.length === 0) {
      setProfitData({});
      return;
    }
    
    const fetchProfits = async () => {
      const { data, error } = await supabase.rpc('get_order_profits', {
        p_order_ids: orderIds,
        p_include_website: hasWebsiteRows,
      });
      if (!error && data) {
        const map: Record<string, { profit: number; total_sales: number }> = {};
        (data as ProfitRow[]).forEach((row) => {
          map[row.order_id] = { profit: Number(row.profit) || 0, total_sales: Number(row.total_sales) || 0 };
        });
        setProfitData(map);
      }
    };
    fetchProfits();
  }, [filteredOrders, hasWebsiteRows]);

  const totals = useMemo(() => {
    const totalOrders = filteredOrders.length;
    // Financial totals exclude cancelled orders, but the count matches the visible list.
    const nonCancelled = filteredOrders.filter((o) => o.status !== "cancelled");
    const totalOrderValue = nonCancelled.reduce((s, o) => s + (o.total_sales_amount || 0), 0);
    const totalReceived = nonCancelled.reduce((s, o) => s + (o.amount_paid || 0), 0);
    const totalPending = Math.max(0, totalOrderValue - totalReceived);

    // Calculate profit from order_items data
    let totalProfit = 0;
    let totalRevenue = 0;
    Object.values(profitData).forEach(({ profit, total_sales }) => {
      totalProfit += profit;
      totalRevenue += total_sales;
    });
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // A zero profit is only a fact when the RPC actually returned priced rows.
    const rows = Object.values(profitData);
    const missingCostOrders = filteredOrders.filter(
      (o) => !profitData[o.id] || profitData[o.id].total_sales === 0,
    ).length;
    const profitKnown = rows.length > 0 && rows.some((r) => r.total_sales !== 0);

    const todayCount = filteredOrders.filter((o) =>
      isSameDay(new Date(o.order_date || o.created_at), new Date()),
    ).length;

    const unlinkedCount = filteredOrders.filter(
      (o) => o.status === "procurement_to_plan" || o.status === "procurement_in_process",
    ).length;
    const unlinkedPct = totalOrders > 0 ? Math.round((unlinkedCount / totalOrders) * 100) : 0;

    const receivedPct = totalOrderValue > 0 ? (totalReceived / totalOrderValue) * 100 : 0;
    const pendingPct = totalOrderValue > 0 ? 100 - receivedPct : 0;

    return {
      totalOrders, totalOrderValue, totalReceived, totalPending, totalProfit, avgMargin,
      profitKnown, missingCostOrders, todayCount, unlinkedCount, unlinkedPct,
      receivedPct, pendingPct,
    };
  }, [filteredOrders, profitData]);

  // Comparison chart data
  const comparisonData = useMemo(() => {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const dayOfMonth = now.getDate();
    const prevMonthStart = startOfMonth(subMonths(now, 1));
    const prevMonthEnd = endOfMonth(subMonths(now, 1));
    const daysInPrevMonth = prevMonthEnd.getDate();
    // Always render the full previous month; current-month bars only render
    // for days that have already occurred this month.
    const totalDays = Math.max(dayOfMonth, daysInPrevMonth);
    const days = Array.from({ length: totalDays }, (_, i) => i + 1);

    return days.map((day) => {
      const currentDayOrders = day > dayOfMonth ? [] : chartOrders.filter((o) => {
        if (o.status === "cancelled") return false;
        const d = new Date(o.order_date || o.created_at);
        return d.getDate() === day &&
          d.getMonth() === currentMonthStart.getMonth() &&
          d.getFullYear() === currentMonthStart.getFullYear() &&
          (salesPersonFilter === "all" || o.sales_person_name === salesPersonFilter);
      });
      const prevDayOrders = day > daysInPrevMonth ? [] : chartOrders.filter((o) => {
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
  }, [chartOrders, salesPersonFilter]);

  const currentMonthLabel = format(new Date(), "MMM yyyy");
  const prevMonthLabel = format(subMonths(new Date(), 1), "MMM yyyy");
  const periodLabel = PERIOD_LABELS[timePeriod];

  const formatChartValue = (value: number) => {
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
    return `₹${value}`;
  };

  return (
    <div className="space-y-5 mb-6">
      {/* Stat cards — four, neutral, each sub-line saying something specific */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border border-border/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Orders</p>
            <p className="text-[30px] font-semibold tabular-nums tracking-tight leading-tight mt-1">
              {totals.totalOrders.toLocaleString("en-IN")}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {periodLabel} · {totals.todayCount} today
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Order Value</p>
            <p className="text-[30px] font-semibold tabular-nums tracking-tight leading-tight mt-1">
              {fmt(totals.totalOrderValue)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Excludes cancelled</p>
          </CardContent>
        </Card>

        <Card className="border border-border/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Profit</p>
            {totals.profitKnown ? (
              <>
                <p className="text-[30px] font-semibold tabular-nums tracking-tight leading-tight mt-1">
                  {fmt(totals.totalProfit)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {totals.avgMargin.toFixed(1)}% average margin
                </p>
              </>
            ) : (
              <>
                <p className="text-[19px] text-muted-foreground leading-tight mt-2">Not available</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Cost price missing on {totals.missingCostOrders.toLocaleString("en-IN")} orders
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border/50">
          <CardContent className="p-4">
            <Link to="/procurement" className="block group">
              <p className="text-xs text-muted-foreground">Unlinked</p>
              <p className="text-[30px] font-semibold tabular-nums tracking-tight leading-tight mt-1 text-primary group-hover:underline">
                {totals.unlinkedCount.toLocaleString("en-IN")}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {totals.unlinkedPct}% of orders unmatched
              </p>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Collection — one number split into its parts, shown as parts */}
      <Card className="border border-border/50">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Collection</p>
          <p className="text-[13px] mt-1">
            {fmt(totals.totalReceived)} received of {fmt(totals.totalOrderValue)} ·{" "}
            <span className="text-primary">{fmt(totals.totalPending)} outstanding</span>
          </p>
          <div className="mt-3 flex h-[10px] w-full overflow-hidden rounded-full bg-muted">
            <div className="bg-success h-full" style={{ width: `${totals.receivedPct}%` }} />
            <div className="bg-primary/55 h-full" style={{ width: `${totals.pendingPct}%` }} />
          </div>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-success" />
              Received {totals.receivedPct.toFixed(1)}%
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-primary/55" />
              Outstanding {totals.pendingPct.toFixed(1)}%
            </span>
          </div>
        </CardContent>
      </Card>

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
                        {payload.map((entry: ChartPayloadItem, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: entry.color }} />
                            <span className="text-muted-foreground">{entry.name}:</span>
                            <span className="font-medium">{fmt(Number(entry.value) || 0)}</span>
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
