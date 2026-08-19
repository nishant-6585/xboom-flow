import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAnalyticsScope } from "@/contexts/AnalyticsScopeContext";

export interface DashboardPerson {
  user_id: string;
  name: string | null;
  leads: number;
  prospects: number;
  pipeline: number;
  pipeline_value: number;
  orders_won: number;
  revenue: number;
  sources: Record<string, number>;
}

export interface DashboardTotals {
  total_leads: number;
  hot_leads: number;
  total_prospects: number;
  a_category: number;
  pipeline_count: number;
  pipeline_value: number;
  pipeline_won_count: number;
  pipeline_won_value: number;
  orders_won: number;
  revenue: number;
  avg_deal: number;
  win_rate: number;
  lead_to_prospect: number;
  prospect_to_pipeline: number;
  pipeline_to_won: number;
}

export type LeadSourceKey =
  | "enquiries"
  | "interakt"
  | "myoperator"
  | "elevenlabs"
  | "email"
  | "qforms"
  | "facebook"
  | "indiamart"
  | "manychat"
  | "google_ads"
  | "website"
  | "abandoned_cart";

export interface SalesDashboardMetrics {
  totals: DashboardTotals;
  by_source: Partial<Record<LeadSourceKey, number>>;
  by_person: DashboardPerson[];
}

const EMPTY_TOTALS: DashboardTotals = {
  total_leads: 0,
  hot_leads: 0,
  total_prospects: 0,
  a_category: 0,
  pipeline_count: 0,
  pipeline_value: 0,
  pipeline_won_count: 0,
  pipeline_won_value: 0,
  orders_won: 0,
  revenue: 0,
  avg_deal: 0,
  win_rate: 0,
  lead_to_prospect: 0,
  prospect_to_pipeline: 0,
  pipeline_to_won: 0,
};

export const EMPTY_DASHBOARD_METRICS: SalesDashboardMetrics = {
  totals: EMPTY_TOTALS,
  by_source: {},
  by_person: [],
};

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);

/**
 * Single source of truth for every Sales Arena dashboard number.
 *
 * All counting rules (converted-lead exclusion, website/unattributed gating,
 * one-owner-per-lead de-duplication) live in the database function so the KPI
 * cards, funnel, lead distribution and manager dashboard can never disagree.
 */
export function useSalesDashboardMetrics(params: {
  startDate?: string | null;
  endDate?: string | null;
  salesPersonId?: string | null;
  includeWebsite?: boolean;
  enabled?: boolean;
}) {
  const { includeWebsite: scopeIncludeWebsite } = useAnalyticsScope();
  const includeWebsite =
    typeof params.includeWebsite === "boolean" ? params.includeWebsite : scopeIncludeWebsite;

  const startDate = params.startDate ?? null;
  const endDate = params.endDate ?? null;
  const salesPersonId = params.salesPersonId && params.salesPersonId !== "all" ? params.salesPersonId : null;

  const query = useQuery({
    queryKey: ["sales-dashboard-metrics", startDate, endDate, salesPersonId, includeWebsite],
    enabled: params.enabled !== false,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<SalesDashboardMetrics> => {
      const { data, error } = await supabase.rpc("get_sales_dashboard_metrics" as any, {
        p_start: startDate,
        p_end: endDate,
        p_sales_person_id: salesPersonId,
        p_include_website: includeWebsite,
      });
      if (error) throw error;

      const raw = (data ?? {}) as any;
      const t = raw.totals ?? {};
      return {
        totals: {
          total_leads: num(t.total_leads),
          hot_leads: num(t.hot_leads),
          total_prospects: num(t.total_prospects),
          a_category: num(t.a_category),
          pipeline_count: num(t.pipeline_count),
          pipeline_value: num(t.pipeline_value),
          pipeline_won_count: num(t.pipeline_won_count),
          pipeline_won_value: num(t.pipeline_won_value),
          orders_won: num(t.orders_won),
          revenue: num(t.revenue),
          avg_deal: num(t.avg_deal),
          win_rate: num(t.win_rate),
          lead_to_prospect: num(t.lead_to_prospect),
          prospect_to_pipeline: num(t.prospect_to_pipeline),
          pipeline_to_won: num(t.pipeline_to_won),
        },
        by_source: (raw.by_source ?? {}) as Partial<Record<LeadSourceKey, number>>,
        by_person: ((raw.by_person ?? []) as any[]).map((p) => ({
          user_id: p.user_id,
          name: p.name ?? null,
          leads: num(p.leads),
          prospects: num(p.prospects),
          pipeline: num(p.pipeline),
          pipeline_value: num(p.pipeline_value),
          orders_won: num(p.orders_won),
          revenue: num(p.revenue),
          sources: (p.sources ?? {}) as Record<string, number>,
        })),
      };
    },
  });

  return {
    metrics: query.data ?? EMPTY_DASHBOARD_METRICS,
    isLoading: query.isLoading,
    error: query.error,
    hasData: !!query.data,
  };
}
