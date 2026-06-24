import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { OrderStatus } from "@/hooks/useOrders";
import { getSlaStatus, UrgencyLevel } from "@/lib/sla";
import { differenceInCalendarDays, format } from "date-fns";

export type ViewAs = "count" | "revenue";

export const PIPELINE_STAGES: { stage: OrderStatus; label: string; colorVar: string }[] = [
  { stage: "po_received", label: "PO Received", colorVar: "hsl(217, 91%, 60%)" },
  { stage: "payment_received", label: "Payment Received", colorVar: "hsl(199, 89%, 48%)" },
  { stage: "procurement_to_plan", label: "Procurement to Plan", colorVar: "hsl(262, 83%, 58%)" },
  { stage: "procurement_in_process", label: "Procurement In Process", colorVar: "hsl(280, 75%, 60%)" },
  { stage: "procurement_done", label: "Procurement Done", colorVar: "hsl(173, 80%, 40%)" },
  { stage: "to_ship", label: "To Ship", colorVar: "hsl(38, 92%, 50%)" },
  { stage: "in_transit", label: "In Transit", colorVar: "hsl(24, 95%, 53%)" },
  { stage: "delivery_done", label: "Delivered", colorVar: "hsl(142, 76%, 36%)" },
  { stage: "cancelled", label: "Cancelled", colorVar: "hsl(0, 84%, 60%)" },
];

interface OrderRow {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  status: OrderStatus;
  total_sales_amount: number | null;
  created_at: string;
  updated_at: string;
  sales_person_name: string | null;
  order_date: string | null;
  priority: number | null;
  is_escalated: boolean | null;
}

export interface PipelineKpis {
  totalOrders: number;
  totalRevenue: number;
  avgPoToDeliveredDays: number;
  slaBreachCount: number;
  conversionRate: number;
  cancelRate: number;
}

export interface FunnelDatum {
  stage: OrderStatus;
  label: string;
  count: number;
  revenue: number;
  pctOfTotal: number;
  color: string;
}

export interface DaysInStageDatum {
  stage: OrderStatus;
  label: string;
  avgDays: number;
  orderCount: number;
  color: string;
}

export interface SlaBreachRow {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  status: OrderStatus;
  daysStuck: number;
  sales_person_name: string | null;
}

export interface TrendDatum {
  date: string;
  count: number;
  revenue: number;
}

export interface OrderPipelineAnalyticsResult {
  kpis: PipelineKpis;
  funnel: FunnelDatum[];
  daysInStage: DaysInStageDatum[];
  slaBreaches: SlaBreachRow[];
  trend: TrendDatum[];
  totalRows: number;
}

function deriveUrgency(row: OrderRow): UrgencyLevel {
  if (row.is_escalated) return "critical";
  const p = row.priority ?? 0;
  if (p >= 3) return "high";
  if (p === 2) return "medium";
  return "low";
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, differenceInCalendarDays(to, from));
}

export function useOrderPipelineAnalytics(params: {
  startDate: Date | undefined;
  endDate: Date | undefined;
  viewAs: ViewAs;
}) {
  const { startDate, endDate, viewAs } = params;

  return useQuery<OrderPipelineAnalyticsResult>({
    queryKey: [
      "order-pipeline-analytics",
      startDate?.toISOString() ?? null,
      endDate?.toISOString() ?? null,
      viewAs,
    ],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select(
          "id, order_number, customer_name, status, total_sales_amount, created_at, updated_at, sales_person_name, order_date, priority, is_escalated"
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (startDate) q = q.gte("created_at", startDate.toISOString());
      if (endDate) q = q.lte("created_at", endDate.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as OrderRow[];
      return computeAnalytics(rows);
    },
  });
}

export function computeAnalytics(rows: OrderRow[]): OrderPipelineAnalyticsResult {
  const now = new Date();
  const totalOrders = rows.length;
  const totalRevenue = rows.reduce((s, r) => s + (Number(r.total_sales_amount) || 0), 0);

  // avg PO -> Delivered: only for orders currently in delivery_done.
  // Caveat: approximates lifecycle duration as (updated_at - created_at).
  // Without a stage_history table we cannot know intermediate transitions or
  // whether the order bounced statuses on the way.
  const delivered = rows.filter((r) => r.status === "delivery_done");
  const avgPoToDeliveredDays = delivered.length
    ? delivered.reduce(
        (s, r) => s + daysBetween(new Date(r.created_at), new Date(r.updated_at)),
        0
      ) / delivered.length
    : 0;

  const cancelledCount = rows.filter((r) => r.status === "cancelled").length;
  const conversionRate = totalOrders ? (delivered.length / totalOrders) * 100 : 0;
  const cancelRate = totalOrders ? (cancelledCount / totalOrders) * 100 : 0;

  // Funnel
  const funnel: FunnelDatum[] = PIPELINE_STAGES.map(({ stage, label, colorVar }) => {
    const inStage = rows.filter((r) => r.status === stage);
    const count = inStage.length;
    const revenue = inStage.reduce((s, r) => s + (Number(r.total_sales_amount) || 0), 0);
    return {
      stage,
      label,
      count,
      revenue,
      pctOfTotal: totalOrders ? (count / totalOrders) * 100 : 0,
      color: colorVar,
    };
  });

  // Days in current stage (snapshot, not historical)
  const daysInStage: DaysInStageDatum[] = PIPELINE_STAGES.map(({ stage, label, colorVar }) => {
    const inStage = rows.filter((r) => r.status === stage);
    const orderCount = inStage.length;
    const avgDays = orderCount
      ? inStage.reduce((s, r) => s + daysBetween(new Date(r.updated_at), now), 0) / orderCount
      : 0;
    return { stage, label, avgDays: Math.round(avgDays * 10) / 10, orderCount, color: colorVar };
  });

  // SLA breaches: orders not in terminal state whose SLA is breached
  const TERMINAL: OrderStatus[] = ["delivery_done", "cancelled"];
  const slaBreaches: SlaBreachRow[] = rows
    .filter((r) => !TERMINAL.includes(r.status))
    .map((r) => {
      const urgency = deriveUrgency(r);
      const status = getSlaStatus(new Date(r.created_at), null, urgency, false);
      return { row: r, status };
    })
    .filter(({ status }) => status === "breached")
    .map(({ row: r }) => ({
      id: r.id,
      order_number: r.order_number,
      customer_name: r.customer_name,
      status: r.status,
      daysStuck: daysBetween(new Date(r.updated_at), now),
      sales_person_name: r.sales_person_name,
    }))
    .sort((a, b) => b.daysStuck - a.daysStuck);

  const slaBreachCount = slaBreaches.length;

  // Trend: orders entering po_received per day = orders created per day in range
  const trendMap = new Map<string, { count: number; revenue: number }>();
  for (const r of rows) {
    const key = format(new Date(r.created_at), "yyyy-MM-dd");
    const existing = trendMap.get(key) ?? { count: 0, revenue: 0 };
    existing.count += 1;
    existing.revenue += Number(r.total_sales_amount) || 0;
    trendMap.set(key, existing);
  }
  const trend: TrendDatum[] = Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, count: v.count, revenue: v.revenue }));

  return {
    kpis: {
      totalOrders,
      totalRevenue,
      avgPoToDeliveredDays: Math.round(avgPoToDeliveredDays * 10) / 10,
      slaBreachCount,
      conversionRate: Math.round(conversionRate * 10) / 10,
      cancelRate: Math.round(cancelRate * 10) / 10,
    },
    funnel,
    daysInStage,
    slaBreaches,
    trend,
    totalRows: totalOrders,
  };
}

/*
 * Future test cases (it.todo):
 * - Empty orders array → KPIs all zero, no NaN
 * - Single order in 'po_received' → funnel shows 1 in po_received, 0 elsewhere
 * - Order in 'delivery_done' with updated_at 5 days after created_at →
 *     contributes 5 to avgPoToDeliveredDays
 * - Date range covering no orders → empty trend array
 * - SLA breaches sorted by oldest first (highest daysStuck)
 */