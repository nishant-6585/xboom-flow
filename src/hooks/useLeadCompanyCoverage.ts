import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SourceCoverage {
  source: string;
  total: number;
  withCompany: number;
  badPlaceholder: number;
  pct: number;
}

export function useLeadCompanyCoverage() {
  return useQuery({
    queryKey: ["lead-company-coverage"],
    // Keep this short so cleanup actions are reflected promptly
    staleTime: 30 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<SourceCoverage[]> => {
      const { data, error } = await supabase.rpc("lead_company_coverage");
      if (error) throw error;
      return (data ?? []).map((r: any) => {
        const total = Number(r.total ?? 0);
        const withCompany = Number(r.with_company ?? 0);
        const badPlaceholder = Number(r.bad_placeholder ?? 0);
        return {
          source: r.source as string,
          total,
          withCompany,
          badPlaceholder,
          pct: total > 0 ? Math.round((withCompany / total) * 100) : 0,
        };
      }).sort((a, b) => b.withCompany - a.withCompany);
    },
  });
}
