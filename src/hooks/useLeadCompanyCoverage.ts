import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SourceCoverage {
  source: string;
  total: number;
  withCompany: number;
  pct: number;
}

const SOURCES: Array<{ key: string; table: string; column: string }> = [
  { key: "Q-Forms",    table: "leads",            column: "company" },
  { key: "Forms",      table: "form_leads",       column: "company" },
  { key: "Interakt",   table: "interakt_leads",   column: "company" },
  { key: "MyOperator", table: "call_logs",        column: "company" },
  { key: "Emails",     table: "email_leads",      column: "customer_company" },
  { key: "Google Ads", table: "google_ads_leads", column: "customer_company" },
  { key: "Enquiries",  table: "enquiries",        column: "customer_company" },
  { key: "Prospects",  table: "prospects",        column: "company" },
];

export function useLeadCompanyCoverage() {
  return useQuery({
    queryKey: ["lead-company-coverage"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SourceCoverage[]> => {
      const out: SourceCoverage[] = [];
      await Promise.all(
        SOURCES.map(async ({ key, table, column }) => {
          const totalRes = await supabase
            .from(table as any)
            .select("id", { count: "exact", head: true });
          const withRes = await supabase
            .from(table as any)
            .select("id", { count: "exact", head: true })
            .not(column, "is", null)
            .neq(column, "");
          const total = totalRes.count ?? 0;
          const withCompany = withRes.count ?? 0;
          out.push({
            source: key,
            total,
            withCompany,
            pct: total > 0 ? Math.round((withCompany / total) * 100) : 0,
          });
        })
      );
      return out.sort((a, b) => b.withCompany - a.withCompany);
    },
  });
}
