import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface DrillDownRecord {
  id: string;
  source: string;
  tab: string;
  customer_name: string;
  product_name: string | null;
  company: string | null;
  date: string;
}

/**
 * Fetches individual lead records for a specific salesperson within a date range,
 * optionally filtered by source type.
 */
export function useLeadDistributionDrillDown(
  startDate: string,
  endDate: string,
  personName: string | null,
  personId: string | null,
  source?: string,
) {
  return useQuery({
    queryKey: ["lead-dist-drilldown", startDate, endDate, personName, personId, source],
    enabled: !!personName,
    queryFn: async (): Promise<DrillDownRecord[]> => {
      const endDateTime = `${endDate}T23:59:59`;
      const results: DrillDownRecord[] = [];

      const shouldFetch = (s: string) => !source || source.toLowerCase() === s;

      // Helper to build a query filtered by salesperson
      const addPersonFilter = (query: any, idCol: string, nameCol: string) => {
        if (personId) return query.eq(idCol, personId);
        return query.ilike(nameCol, personName!);
      };

      const fetches: Promise<void>[] = [];

      if (shouldFetch("enquiry")) {
        fetches.push(
          (async () => {
            let q = supabase
              .from("enquiries")
              .select("id, customer_name, product_name, customer_company, created_at")
              .gte("created_at", startDate)
              .lte("created_at", endDateTime)
              .order("created_at", { ascending: false })
              .limit(100);
            q = addPersonFilter(q, "sales_person_id", "sales_person_name");
            const { data } = await q;
            data?.forEach((r: any) =>
              results.push({
                id: r.id,
                source: "Enquiry",
                tab: "enquiries",
                customer_name: r.customer_name || "Unknown",
                product_name: r.product_name,
                company: r.customer_company,
                date: r.created_at,
              }),
            );
          })(),
        );
      }

      if (shouldFetch("call")) {
        fetches.push(
          (async () => {
            let q = supabase
              .from("call_logs")
              .select("id, customer_name, product_name, company, created_at, caller_number")
              .gte("created_at", startDate)
              .lte("created_at", endDateTime)
              .order("created_at", { ascending: false })
              .limit(100);
            q = addPersonFilter(q, "sales_person_id", "sales_person_name");
            const { data } = await q;
            data?.forEach((r: any) =>
              results.push({
                id: r.id,
                source: "Call",
                tab: "leads",
                customer_name: r.customer_name || r.caller_number || "Unknown",
                product_name: r.product_name,
                company: r.company,
                date: r.created_at,
              }),
            );
          })(),
        );
      }

      if (shouldFetch("form")) {
        fetches.push(
          (async () => {
            let q = supabase
              .from("form_leads")
              .select("id, customer_name, product_name, company, created_at")
              .gte("created_at", startDate)
              .lte("created_at", endDateTime)
              .order("created_at", { ascending: false })
              .limit(100);
            q = addPersonFilter(q, "sales_person_id", "sales_person_name");
            const { data } = await q;
            data?.forEach((r: any) =>
              results.push({
                id: r.id,
                source: "Form",
                tab: "leads",
                customer_name: r.customer_name || "Unknown",
                product_name: r.product_name,
                company: r.company,
                date: r.created_at,
              }),
            );
          })(),
        );
      }

      if (shouldFetch("email")) {
        fetches.push(
          (async () => {
            let q = supabase
              .from("email_leads")
              .select("id, customer_name, product_name, customer_company, created_at")
              .gte("created_at", startDate)
              .lte("created_at", endDateTime)
              .order("created_at", { ascending: false })
              .limit(100);
            q = addPersonFilter(q, "sales_person_id", "sales_person_name");
            const { data } = await q;
            data?.forEach((r: any) =>
              results.push({
                id: r.id,
                source: "Email",
                tab: "leads",
                customer_name: r.customer_name || "Unknown",
                product_name: r.product_name,
                company: r.customer_company,
                date: r.created_at,
              }),
            );
          })(),
        );
      }

      if (shouldFetch("interakt")) {
        fetches.push(
          (async () => {
            let q = supabase
              .from("interakt_leads")
              .select("id, customer_name, product_name, company, created_at")
              .gte("created_at", startDate)
              .lte("created_at", endDateTime)
              .order("created_at", { ascending: false })
              .limit(100);
            q = addPersonFilter(q, "sales_person_id", "sales_person_name");
            const { data } = await q;
            data?.forEach((r: any) =>
              results.push({
                id: r.id,
                source: "Interakt",
                tab: "leads",
                customer_name: r.customer_name || "Unknown",
                product_name: r.product_name,
                company: r.company,
                date: r.created_at,
              }),
            );
          })(),
        );
      }

      await Promise.all(fetches);

      // Sort by date descending
      results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return results;
    },
  });
}
