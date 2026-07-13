import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAnalyticsScope } from "@/contexts/AnalyticsScopeContext";
import { isAnalyticsWebsite } from "@/lib/orderSource";
import { Loader2, TrendingUp } from "lucide-react";
import { format, subDays, subWeeks, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachWeekOfInterval, eachMonthOfInterval, isWithinInterval } from "date-fns";

interface TrendData {
  period: string;
  orders: number;
  pipelineValue: number;
  paymentsReceived: number;
}

type ViewMode = "weekly" | "monthly";

export function KeyMetricsTrendChart() {
  const { role } = useAuth();
  const { includeWebsite } = useAnalyticsScope();
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [data, setData] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);

  const canViewFinance = role === "admin" || role === "finance";

  useEffect(() => {
    const fetchTrendData = async () => {
      setLoading(true);
      try {
        const now = new Date();
        let intervals: { start: Date; end: Date; label: string }[] = [];

        if (viewMode === "weekly") {
          // Last 8 weeks
          const weeks = eachWeekOfInterval(
            { start: subWeeks(now, 7), end: now },
            { weekStartsOn: 1 }
          );
          intervals = weeks.map((weekStart) => ({
            start: startOfWeek(weekStart, { weekStartsOn: 1 }),
            end: endOfWeek(weekStart, { weekStartsOn: 1 }),
            label: format(weekStart, "MMM dd"),
          }));
        } else {
          // Last 6 months
          const months = eachMonthOfInterval({
            start: subDays(now, 180),
            end: now,
          });
          intervals = months.slice(-6).map((monthStart) => ({
            start: startOfMonth(monthStart),
            end: endOfMonth(monthStart),
            label: format(monthStart, "MMM yy"),
          }));
        }

        // Fetch all data
        const [ordersRes, pipelineRes, paymentsRes] = await Promise.all([
          supabase.from("orders").select("id, created_at, order_date, total_sales_amount, source, sales_person_id"),
          supabase.from("pipeline_orders").select("id, created_at, expected_price"),
          supabase.from("payment_records").select("id, created_at, amount, status").eq("status", "approved"),
        ]);

        const ordersRaw = ordersRes.data || [];
        const orders = includeWebsite
          ? ordersRaw
          : ordersRaw.filter((o: any) => !isAnalyticsWebsite(o));
        const pipeline = pipelineRes.data || [];
        const payments = paymentsRes.data || [];

        // Aggregate data by interval
        const trendData: TrendData[] = intervals.map((interval) => {
          const ordersInPeriod = orders.filter((o) =>
            isWithinInterval(new Date(o.order_date || o.created_at), { start: interval.start, end: interval.end })
          );
          const pipelineInPeriod = pipeline.filter((p) =>
            isWithinInterval(new Date(p.created_at), { start: interval.start, end: interval.end })
          );
          const paymentsInPeriod = payments.filter((p) =>
            isWithinInterval(new Date(p.created_at), { start: interval.start, end: interval.end })
          );

          return {
            period: interval.label,
            orders: ordersInPeriod.length,
            pipelineValue: pipelineInPeriod.reduce((sum, p) => sum + (p.expected_price || 0), 0),
            paymentsReceived: paymentsInPeriod.reduce((sum, p) => sum + (p.amount || 0), 0),
          };
        });

        setData(trendData);
      } catch (error) {
        console.error("Error fetching trend data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrendData();
  }, [viewMode, includeWebsite]);

  const formatValue = (value: number) => {
    if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toString();
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-sm mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium">
                {entry.dataKey === "orders"
                  ? entry.value
                  : `₹${formatValue(entry.value)}`}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="glass">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Key Metrics Trend</CardTitle>
          </div>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="weekly" className="text-xs px-3">
                Weekly
              </TabsTrigger>
              <TabsTrigger value="monthly" className="text-xs px-3">
                Monthly
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-[300px]">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="h-[300px] sm:h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 20, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                  tickFormatter={(value) => formatValue(value)}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: "12px" }}
                  iconType="square"
                  iconSize={10}
                />
                <Bar
                  yAxisId="right"
                  dataKey="orders"
                  name="Orders"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
                <Bar
                  yAxisId="left"
                  dataKey="pipelineValue"
                  name="Pipeline Value"
                  fill="hsl(217, 91%, 60%)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
                {canViewFinance && (
                  <Bar
                    yAxisId="left"
                    dataKey="paymentsReceived"
                    name="Payments Received"
                    fill="hsl(142, 71%, 45%)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-primary" />
            <span>Orders Count</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(217, 91%, 60%)" }} />
            <span>Pipeline Value (₹)</span>
          </div>
          {canViewFinance && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(142, 71%, 45%)" }} />
              <span>Payments Received (₹)</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
