import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAnalyticsScope } from "@/contexts/AnalyticsScopeContext";

export interface LeadSourceCounts {
  enquiry: number;
  call: number;
  form: number;
  email: number;
  interakt: number;
  other: number;
}

export interface LeadDistEntry {
  key: string;
  name: string;
  leads: number;
  prospects: number;
  pipeline: number;
  sources: LeadSourceCounts;
}

export interface LeadDistributionResult {
  data: LeadDistEntry[];
  total: number;
  totalProspects: number;
  totalPipeline: number;
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);

/**
 * Single source of truth: derives salesperson-level lead distribution from the
 * server-side get_sales_dashboard_metrics aggregate so the chart, KPI cards and
 * funnel can never disagree.
 */
export function useLeadDistribution(startDate: string, endDate: string) {
  const { includeWebsite } = useAnalyticsScope();

  return useQuery<LeadDistributionResult>({
    queryKey: ["lead-distribution-v3", startDate, endDate, includeWebsite],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sales_dashboard_metrics" as any, {
        p_start: startDate || null,
        p_end: endDate || null,
        p_sales_person_id: null,
        p_include_website: includeWebsite,
      });
      if (error) throw error;

      const raw = (data ?? {}) as any;
      const totals = raw.totals ?? {};
      const people = (raw.by_person ?? []) as any[];

      const entries: LeadDistEntry[] = people.map((p) => {
        const s = (p.sources ?? {}) as Record<string, number>;
        const enquiry = num(s.enquiries);
        const call = num(s.myoperator) + num(s.elevenlabs);
        const email = num(s.email);
        const interakt = num(s.interakt);
        const form = num(s.qforms);
        const leads = num(p.leads);
        const other = Math.max(0, leads - (enquiry + call + email + interakt + form));
        return {
          key: `user:${p.user_id}`,
          name: p.name || "Unknown",
          leads,
          prospects: num(p.prospects),
          pipeline: num(p.pipeline),
          sources: { enquiry, call, form, email, interakt, other },
        };
      });

      return {
        data: entries,
        total: num(totals.total_leads),
        totalProspects: num(totals.total_prospects),
        totalPipeline: num(totals.pipeline_count),
      };
    },
  });
}
