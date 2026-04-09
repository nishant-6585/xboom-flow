import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LeadDistEntry {
  name: string;
  leads: number;
  sources: { enquiry: number; call: number; form: number; email: number; interakt: number };
}

export function useLeadDistribution(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["lead-distribution", startDate, endDate],
    queryFn: async () => {
      const map = new Map<string, LeadDistEntry>();

      const ensure = (name: string) => {
        if (!name) name = "Unassigned";
        if (!map.has(name))
          map.set(name, { name, leads: 0, sources: { enquiry: 0, call: 0, form: 0, email: 0, interakt: 0 } });
        return map.get(name)!;
      };

      // 1. Enquiries
      const { data: enquiries } = await supabase
        .from("enquiries")
        .select("sales_person_name, created_at")
        .gte("created_at", startDate)
        .lte("created_at", endDate + "T23:59:59");
      enquiries?.forEach((e) => {
        const entry = ensure(e.sales_person_name || "Unassigned");
        entry.leads++;
        entry.sources.enquiry++;
      });

      // 2. Call logs
      const { data: calls } = await supabase
        .from("call_logs")
        .select("sales_person_name, created_at")
        .gte("created_at", startDate)
        .lte("created_at", endDate + "T23:59:59");
      calls?.forEach((c) => {
        const entry = ensure(c.sales_person_name || "Unassigned");
        entry.leads++;
        entry.sources.call++;
      });

      // 3. Form leads
      const { data: forms } = await supabase
        .from("form_leads")
        .select("sales_person_name, created_at")
        .gte("created_at", startDate)
        .lte("created_at", endDate + "T23:59:59");
      forms?.forEach((f) => {
        const entry = ensure(f.sales_person_name || "Unassigned");
        entry.leads++;
        entry.sources.form++;
      });

      // 4. Email leads
      const { data: emails } = await supabase
        .from("email_leads")
        .select("sales_person_name, created_at")
        .gte("created_at", startDate)
        .lte("created_at", endDate + "T23:59:59");
      emails?.forEach((el) => {
        const entry = ensure(el.sales_person_name || "Unassigned");
        entry.leads++;
        entry.sources.email++;
      });

      // 5. Interakt leads
      const { data: interakt } = await supabase
        .from("interakt_leads")
        .select("customer_name, created_at")
        .gte("created_at", startDate)
        .lte("created_at", endDate + "T23:59:59");
      interakt?.forEach(() => {
        // Interakt leads don't have sales_person_name, count as unassigned
        const entry = ensure("Unassigned");
        entry.leads++;
        entry.sources.interakt++;
      });

      const result = Array.from(map.values()).sort((a, b) => b.leads - a.leads);
      const total = result.reduce((s, r) => s + r.leads, 0);
      return { data: result, total };
    },
  });
}
