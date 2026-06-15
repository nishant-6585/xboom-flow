import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface LeadSourceCounts {
  enquiry: number;
  call: number;
  form: number;
  email: number;
  interakt: number;
}

export interface LeadDistEntry {
  key: string;
  name: string;
  leads: number;
  prospects: number;
  pipeline: number;
  sources: LeadSourceCounts;
}

const KNOWN_NAMES: Record<string, string> = {
  "456e91f8-34cc-4f92-a1c1-a092f2bbed39": "suman das",
  "a790b58d-8e3d-4333-b6d6-08be631c865d": "Narasimha",
  "457fc2d5-9fc5-439a-938e-5b998549b811": "mohammed musthak",
  "e05f9afe-0160-4956-bb1f-496028386062": "Arjav chauhan",
  "9fea57d6-a27a-4b35-9293-e2151b84f45a": "Rohit",
  "7b4818c1-a3d0-44bc-9aac-3744e018e441": "Anvesh Apkari",
};

function normalizeName(name?: string | null) {
  const cleaned = (name || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  const lower = cleaned.toLowerCase();
  if (["unassigned", "unknown", "n/a", "na", "null", "none"].includes(lower)) {
    return null;
  }

  if (lower === "narasimha" || lower === "narasimha") return "Narasimha";
  if (["mushtaq", "musthak", "mohammed mushtaq", "mohammed musthak"].includes(lower)) return "mohammed musthak";
  if (["suman", "suman das"].includes(lower)) return "suman das";
  if (["arjav", "arjav chauhan", "arnav"].includes(lower)) return "Arjav chauhan";

  return cleaned;
}

function getDisplayName(userId?: string | null, name?: string | null) {
  if (userId && KNOWN_NAMES[userId]) return KNOWN_NAMES[userId];
  return normalizeName(name);
}

export function useLeadDistribution(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["lead-distribution-v2", startDate, endDate],
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const map = new Map<string, LeadDistEntry>();

      const ensure = (userId?: string | null, name?: string | null) => {
        const displayName = getDisplayName(userId, name);
        if (!displayName) return null;

        const key = userId ? `user:${userId}` : `name:${displayName.toLowerCase()}`;

        if (!map.has(key)) {
          map.set(key, {
            key,
            name: displayName,
            leads: 0,
            prospects: 0,
            pipeline: 0,
            sources: { enquiry: 0, call: 0, form: 0, email: 0, interakt: 0 },
          });
        }

        return map.get(key)!;
      };

      const endDateTime = `${endDate}T23:59:59`;

      const [enquiriesRes, callsRes, formsRes, emailsRes, interaktRes, prospectsRes, pipelineRes] = await Promise.all([
        supabase
          .from("enquiries")
          .select("sales_person_id, sales_person_name, created_at")
          .gte("created_at", startDate)
          .lte("created_at", endDateTime),
        supabase
          .from("call_logs")
          .select("sales_person_id, sales_person_name, created_at")
          .eq("is_enquiry_converted", false)
          .gte("created_at", startDate)
          .lte("created_at", endDateTime),
        supabase
          .from("form_leads")
          .select("sales_person_id, sales_person_name, created_at")
          .eq("is_enquiry_converted", false)
          .gte("created_at", startDate)
          .lte("created_at", endDateTime),
        supabase
          .from("email_leads")
          .select("sales_person_id, sales_person_name, created_at")
          .eq("is_enquiry_converted", false)
          .gte("created_at", startDate)
          .lte("created_at", endDateTime),
        supabase
          .from("interakt_leads")
          .select("sales_person_id, sales_person_name, created_at")
          .eq("is_enquiry_converted", false)
          .gte("created_at", startDate)
          .lte("created_at", endDateTime),
        supabase
          .from("prospects")
          .select("created_by, created_by_name, created_at")
          .gte("created_at", startDate)
          .lte("created_at", endDateTime),
        supabase
          .from("pipeline_orders")
          .select("sales_person_id, sales_person_name, created_at")
          .gte("created_at", startDate)
          .lte("created_at", endDateTime),
      ]);

      const responses = [enquiriesRes, callsRes, formsRes, emailsRes, interaktRes, prospectsRes, pipelineRes];
      const errored = responses.find((res) => res.error);
      if (errored?.error) throw errored.error;

      enquiriesRes.data?.forEach((row) => {
        const entry = ensure(row.sales_person_id, row.sales_person_name);
        if (!entry) return;
        entry.leads += 1;
        entry.sources.enquiry += 1;
      });

      callsRes.data?.forEach((row) => {
        const entry = ensure(row.sales_person_id, row.sales_person_name);
        if (!entry) return;
        entry.leads += 1;
        entry.sources.call += 1;
      });

      formsRes.data?.forEach((row) => {
        const entry = ensure(row.sales_person_id, row.sales_person_name);
        if (!entry) return;
        entry.leads += 1;
        entry.sources.form += 1;
      });

      emailsRes.data?.forEach((row) => {
        const entry = ensure(row.sales_person_id, row.sales_person_name);
        if (!entry) return;
        entry.leads += 1;
        entry.sources.email += 1;
      });

      interaktRes.data?.forEach((row) => {
        const entry = ensure(row.sales_person_id, row.sales_person_name);
        if (!entry) return;
        entry.leads += 1;
        entry.sources.interakt += 1;
      });

      prospectsRes.data?.forEach((row) => {
        const entry = ensure(row.created_by, row.created_by_name);
        if (!entry) return;
        entry.prospects += 1;
      });

      pipelineRes.data?.forEach((row) => {
        const entry = ensure(row.sales_person_id, row.sales_person_name);
        if (!entry) return;
        entry.pipeline += 1;
      });

      const data = Array.from(map.values()).sort((a, b) => b.leads - a.leads);
      const total = data.reduce((sum, entry) => sum + entry.leads, 0);
      const totalProspects = data.reduce((sum, entry) => sum + entry.prospects, 0);
      const totalPipeline = data.reduce((sum, entry) => sum + entry.pipeline, 0);

      return { data, total, totalProspects, totalPipeline };
    },
  });
}
