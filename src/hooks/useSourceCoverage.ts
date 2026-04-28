import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SourceRow {
  source: string;
  total: number;
  withCompany: number;
  pct: number;
}

export type CoverageDataset = "prospects" | "followups" | "pipeline";

/**
 * Source-wise entry counts + Company-field coverage for Prospects,
 * Followups, and Pipeline Orders. Mirrors the Lead Source coverage card.
 *
 * - prospects: groups by `source_type`, company column = `company`
 * - followups: groups by `source_type` (origin module), no company column → coverage hidden
 * - pipeline:  groups by `lead_source`, company column = `customer_company`
 */
export function useSourceCoverage(dataset: CoverageDataset) {
  return useQuery({
    queryKey: ["source-coverage", dataset],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ rows: SourceRow[]; hasCompany: boolean }> => {
      const cfg = {
        prospects: { table: "prospects",       group: "source_type",  company: "company"           as string | null },
        followups: { table: "followups",       group: "source_type",  company: null                as string | null },
        pipeline:  { table: "pipeline_orders", group: "lead_source",  company: "customer_company"  as string | null },
      }[dataset];

      const { data, error } = await supabase
        .from(cfg.table as any)
        .select(`${cfg.group}${cfg.company ? `,${cfg.company}` : ""}`)
        .limit(10000);
      if (error) throw error;

      const map = new Map<string, { total: number; withCompany: number }>();
      (data ?? []).forEach((row: any) => {
        const key = (row[cfg.group] || "Unknown").toString();
        const cur = map.get(key) || { total: 0, withCompany: 0 };
        cur.total += 1;
        if (cfg.company) {
          const v = row[cfg.company];
          if (v && String(v).trim() !== "") cur.withCompany += 1;
        }
        map.set(key, cur);
      });

      const rows = Array.from(map.entries())
        .map(([source, v]) => ({
          source: prettify(source),
          total: v.total,
          withCompany: v.withCompany,
          pct: v.total > 0 ? Math.round((v.withCompany / v.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total);

      return { rows, hasCompany: !!cfg.company };
    },
  });
}

function prettify(s: string): string {
  if (!s || s === "Unknown") return "Unknown";
  const map: Record<string, string> = {
    myoperator: "MyOperator",
    interakt: "Interakt",
    google_ads: "Google Ads",
    form_lead: "Forms",
    email: "Emails",
    enquiry: "Enquiries",
    prospect: "Prospect",
    pipeline: "Pipeline",
    lead: "Lead",
    chat: "Chat",
    call: "Call",
    referral: "Referral",
    repeated: "Repeated",
    "walk-in": "Walk-in",
  };
  return map[s.toLowerCase()] ?? s.charAt(0).toUpperCase() + s.slice(1);
}