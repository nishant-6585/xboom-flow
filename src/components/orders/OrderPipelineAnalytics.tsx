import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { EmptyState } from "@/components/data-states/EmptyState";
import { TableSkeleton } from "@/components/data-states/TableSkeleton";
import { DataErrorState } from "@/components/data-states/DataErrorState";
import {
  BarChart3,
  RefreshCw,
  Package,
  IndianRupee,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  LabelList,
} from "recharts";
import { subDays, startOfDay, endOfDay, format } from "date-fns";
import {
  useOrderPipelineAnalytics,
  ViewAs,
  PIPELINE_STAGES,
} from "@/hooks/useOrderPipelineAnalytics";

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function stageLabel(stage: string): string {
  return PIPELINE_STAGES.find((s) => s.stage === stage)?.label ?? stage;
}

export function OrderPipelineAnalytics() {
  const [startDate, setStartDate] = useState<Date | undefined>(() => startOfDay(subDays(new Date(), 30)));
  const [endDate, setEndDate] = useState<Date | undefined>(() => endOfDay(new Date()));
  const [viewAs, setViewAs] = useState<ViewAs>("count");

  const { data, isLoading, error, refetch, isFetching } = useOrderPipelineAnalytics({
    startDate,
    endDate,
    viewAs,
  });

  const clearDates = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const rangeLabel = useMemo(() => {
    if (!startDate && !endDate) return "All time";
    if (startDate && endDate) return `${format(startDate, "dd MMM")} – ${format(endDate, "dd MMM yyyy")}`;
    return "Custom";
  }, [startDate, endDate]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Pipeline Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Snapshot of orders currently in each stage · {rangeLabel}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ToggleGroup
            type="single"
            value={viewAs}
            onValueChange={(v) => v && setViewAs(v as ViewAs)}
            size="sm"
          >
            <ToggleGroupItem value="count">Count</ToggleGroupItem>
            <ToggleGroupItem value="revenue">Revenue</ToggleGroupItem>
          </ToggleGroup>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-3">
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onClear={clearDates}
        />
      </div>

      {isLoading && <TableSkeleton rows={4} columns={6} />}

      {error && (
        <DataErrorState
          message={(error as Error).message || "Failed to load pipeline analytics."}
          onRetry={() => refetch()}
        />
      )}

      {data && data.totalRows === 0 && !isLoading && (
        <EmptyState
          icon={BarChart3}
          title="No orders in this period"
          description="Try widening the date range or check that orders have been created."
        />
      )}

      {data && data.totalRows > 0 && (
        <>
          <KpiStrip data={data} />
          <FunnelSection data={data} viewAs={viewAs} />
          <DaysInStageSection data={data} />
          <SlaBreachSection data={data} />
          <TrendSection data={data} viewAs={viewAs} />
        </>
      )}
    </div>
  );
}

/* ---------------- Sub-components ---------------- */

function KpiStrip({ data }: { data: NonNullable<ReturnType<typeof useOrderPipelineAnalytics>["data"]> }) {
  const { kpis } = data;
  const items = [
    { label: "Total Orders", value: kpis.totalOrders.toLocaleString(), icon: Package, tone: "text-foreground" },
    { label: "Total Revenue", value: formatINR(kpis.totalRevenue), icon: IndianRupee, tone: "text-primary" },
    { label: "Avg PO → Delivered", value: `${kpis.avgPoToDeliveredDays} d`, icon: Clock, tone: "text-foreground" },
    {
      label: "SLA Breached",
      value: kpis.slaBreachCount.toLocaleString(),
      icon: AlertTriangle,
      tone: kpis.slaBreachCount > 0 ? "text-destructive" : "text-foreground",
    },
    { label: "Conversion Rate", value: `${kpis.conversionRate}%`, icon: CheckCircle2, tone: "text-green-600" },
    { label: "Cancelled Rate", value: `${kpis.cancelRate}%`, icon: XCircle, tone: "text-destructive" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {items.map((it) => (
        <Card key={it.label}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <it.icon className="h-3.5 w-3.5" />
              {it.label}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${it.tone}`}>{it.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FunnelSection({
  data,
  viewAs,
}: {
  data: NonNullable<ReturnType<typeof useOrderPipelineAnalytics>["data"]>;
  viewAs: ViewAs;
}) {
  const dataKey = viewAs === "revenue" ? "revenue" : "count";
  const chartData = data.funnel.map((f) => ({
    ...f,
    displayValue: viewAs === "revenue" ? f.revenue : f.count,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Pipeline Funnel</CardTitle>
        <CardDescription>
          Orders currently in each stage ({viewAs === "revenue" ? "revenue" : "count"})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 60, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                interval={0}
                angle={-25}
                textAnchor="end"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => (viewAs === "revenue" ? formatINR(Number(v)) : String(v))}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as typeof chartData[number];
                  return (
                    <div className="bg-popover border rounded-lg p-2 shadow-lg text-sm">
                      <p className="font-medium">{p.label}</p>
                      <p className="text-muted-foreground">Orders: {p.count}</p>
                      <p className="text-muted-foreground">Revenue: {formatINR(p.revenue)}</p>
                      <p className="text-muted-foreground">{p.pctOfTotal.toFixed(1)}% of total</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey={dataKey} radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.stage} fill={entry.color} />
                ))}
                <LabelList
                  dataKey={dataKey}
                  position="top"
                  className="fill-foreground"
                  fontSize={11}
                  formatter={(v: number) => (viewAs === "revenue" ? formatINR(v) : v)}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function DaysInStageSection({
  data,
}: {
  data: NonNullable<ReturnType<typeof useOrderPipelineAnalytics>["data"]>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Days in Current Stage</CardTitle>
        <CardDescription>
          Average time orders have spent in their current stage (snapshot — not historical transitions)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.daysInStage} margin={{ top: 16, right: 16, bottom: 60, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                interval={0}
                angle={-25}
                textAnchor="end"
              />
              <YAxis tick={{ fontSize: 11 }} label={{ value: "Days", angle: -90, position: "insideLeft", fontSize: 11 }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as typeof data.daysInStage[number];
                  return (
                    <div className="bg-popover border rounded-lg p-2 shadow-lg text-sm">
                      <p className="font-medium">{p.label}</p>
                      <p className="text-muted-foreground">Avg days: {p.avgDays}</p>
                      <p className="text-muted-foreground">Orders: {p.orderCount}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="avgDays" radius={[4, 4, 0, 0]}>
                {data.daysInStage.map((entry) => (
                  <Cell key={entry.stage} fill={entry.color} fillOpacity={entry.orderCount === 0 ? 0.2 : 0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function SlaBreachSection({
  data,
}: {
  data: NonNullable<ReturnType<typeof useOrderPipelineAnalytics>["data"]>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          SLA Breaches
        </CardTitle>
        <CardDescription>Open orders past their SLA deadline · sorted oldest first</CardDescription>
      </CardHeader>
      <CardContent>
        {data.slaBreaches.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No SLA breaches in this period 🎉
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Days Stuck</TableHead>
                  <TableHead>Sales Person</TableHead>
                  <TableHead className="text-right">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.slaBreaches.slice(0, 50).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.order_number ?? "—"}</TableCell>
                    <TableCell>{row.customer_name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{stageLabel(row.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-destructive font-semibold">{row.daysStuck}d</span>
                    </TableCell>
                    <TableCell>{row.sales_person_name ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        to={`/orders?tab=list&order_id=${row.id}`}
                        className="text-primary hover:underline text-sm"
                      >
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrendSection({
  data,
  viewAs,
}: {
  data: NonNullable<ReturnType<typeof useOrderPipelineAnalytics>["data"]>;
  viewAs: ViewAs;
}) {
  const dataKey = viewAs === "revenue" ? "revenue" : "count";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Orders Entering Pipeline</CardTitle>
        <CardDescription>
          {viewAs === "revenue" ? "Revenue" : "Count"} of new orders per day
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.trend.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No orders entered the pipeline in this period.
          </p>
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trend} margin={{ top: 16, right: 16, bottom: 16, left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => format(new Date(v), "dd MMM")}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => (viewAs === "revenue" ? formatINR(Number(v)) : String(v))}
                />
                <Tooltip
                  labelFormatter={(v) => format(new Date(v as string), "dd MMM yyyy")}
                  formatter={(value: number) =>
                    viewAs === "revenue" ? formatINR(value) : value
                  }
                />
                <Line
                  type="monotone"
                  dataKey={dataKey}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}