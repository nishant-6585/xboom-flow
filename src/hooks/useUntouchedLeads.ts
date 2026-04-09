import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface UntouchedLead {
  id: string;
  source: "enquiry" | "call" | "form" | "email";
  customer_name: string;
  city: string | null;
  product_name: string | null;
  lead_source: string | null;
  sales_person_id: string | null;
  sales_person_name: string | null;
  created_at: string;
  updated_at: string;
  status: string | null;
  untouched_hours: number;
  bucket: "T+1" | "T+2" | "T+3" | "T++";
}

function getBucket(hours: number): UntouchedLead["bucket"] | null {
  if (hours <= 24) return null; // Not yet untouched (within 24h grace)
  if (hours <= 48) return "T+1";
  if (hours <= 72) return "T+2";
  if (hours <= 96) return "T+3";
  return "T++";
}

function computeHours(createdAt: string): number {
  return (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
}

function isUntouched(created: string, updated: string): boolean {
  // If updated_at is within 5 seconds of created_at, consider untouched
  const diff = Math.abs(new Date(updated).getTime() - new Date(created).getTime());
  return diff < 5000;
}

export function useUntouchedLeads() {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ["untouched-leads"],
    queryFn: async () => {
      const results: UntouchedLead[] = [];

      // 1. Enquiries
      const { data: enquiries } = await supabase
        .from("enquiries")
        .select("id, customer_name, product_name, lead_source, sales_person_id, sales_person_name, created_at, updated_at, status")
        .not("status", "in", "(order_won,moved_to_pipeline,lost)");

      enquiries?.forEach((e) => {
        if (!isUntouched(e.created_at, e.updated_at)) return;
        const hours = computeHours(e.created_at);
        const bucket = getBucket(hours);
        if (!bucket) return;
        results.push({
          id: e.id, source: "enquiry", customer_name: e.customer_name,
          city: null, product_name: e.product_name, lead_source: e.lead_source,
          sales_person_id: e.sales_person_id, sales_person_name: e.sales_person_name,
          created_at: e.created_at, updated_at: e.updated_at, status: e.status,
          untouched_hours: hours, bucket,
        });
      });

      // 2. Call logs
      const { data: calls } = await supabase
        .from("call_logs")
        .select("id, customer_name, city, product_name, lead_source, sales_person_id, sales_person_name, created_at, updated_at")
        .eq("lead_created", false);

      calls?.forEach((c) => {
        if (!isUntouched(c.created_at, c.updated_at)) return;
        const hours = computeHours(c.created_at);
        const bucket = getBucket(hours);
        if (!bucket) return;
        results.push({
          id: c.id, source: "call", customer_name: c.customer_name || "Unknown",
          city: c.city, product_name: c.product_name, lead_source: c.lead_source,
          sales_person_id: c.sales_person_id, sales_person_name: c.sales_person_name,
          created_at: c.created_at, updated_at: c.updated_at, status: null,
          untouched_hours: hours, bucket,
        });
      });

      // 3. Form leads
      const { data: forms } = await supabase
        .from("form_leads")
        .select("id, customer_name, city, product_name, sales_person_id, sales_person_name, created_at, updated_at, status")
        .not("status", "in", "(converted,prospect)");

      forms?.forEach((f) => {
        if (!isUntouched(f.created_at, f.updated_at)) return;
        const hours = computeHours(f.created_at);
        const bucket = getBucket(hours);
        if (!bucket) return;
        results.push({
          id: f.id, source: "form", customer_name: f.customer_name || "Unknown",
          city: f.city, product_name: f.product_name, lead_source: "Form",
          sales_person_id: f.sales_person_id, sales_person_name: f.sales_person_name,
          created_at: f.created_at, updated_at: f.updated_at, status: f.status,
          untouched_hours: hours, bucket,
        });
      });

      // 4. Email leads
      const { data: emails } = await supabase
        .from("email_leads")
        .select("id, customer_name, city, product_name, lead_source, sales_person_id, sales_person_name, created_at, updated_at, status")
        .not("status", "in", "(converted,prospect)");

      emails?.forEach((el) => {
        if (!isUntouched(el.created_at, el.updated_at)) return;
        const hours = computeHours(el.created_at);
        const bucket = getBucket(hours);
        if (!bucket) return;
        results.push({
          id: el.id, source: "email", customer_name: el.customer_name || "Unknown",
          city: el.city, product_name: el.product_name, lead_source: el.lead_source || "Email",
          sales_person_id: el.sales_person_id, sales_person_name: el.sales_person_name,
          created_at: el.created_at, updated_at: el.updated_at, status: el.status,
          untouched_hours: hours, bucket,
        });
      });

      // Sort by highest delay first
      results.sort((a, b) => b.untouched_hours - a.untouched_hours);
      return results;
    },
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min
  });
}

export function useUntouchedStats(leads: UntouchedLead[] | undefined) {
  if (!leads || leads.length === 0) {
    return {
      total: 0,
      t1: 0, t2: 0, t3: 0, tPlus: 0,
      avgFirstTouchHours: 0,
      untouchedPercent: 0,
      bySalesperson: [] as SalespersonStats[],
      bucketTrend: [] as { bucket: string; count: number }[],
    };
  }

  const t1 = leads.filter((l) => l.bucket === "T+1").length;
  const t2 = leads.filter((l) => l.bucket === "T+2").length;
  const t3 = leads.filter((l) => l.bucket === "T+3").length;
  const tPlus = leads.filter((l) => l.bucket === "T++").length;
  const avgHours = leads.reduce((s, l) => s + l.untouched_hours, 0) / leads.length;

  // By salesperson
  const spMap = new Map<string, UntouchedLead[]>();
  leads.forEach((l) => {
    const key = l.sales_person_name || "Unassigned";
    if (!spMap.has(key)) spMap.set(key, []);
    spMap.get(key)!.push(l);
  });

  const bySalesperson: SalespersonStats[] = Array.from(spMap.entries()).map(([name, spLeads]) => {
    const spT1 = spLeads.filter((l) => l.bucket === "T+1").length;
    const spT2 = spLeads.filter((l) => l.bucket === "T+2").length;
    const spT3 = spLeads.filter((l) => l.bucket === "T+3").length;
    const spTPlus = spLeads.filter((l) => l.bucket === "T++").length;
    const severityScore = spT1 * 1 + spT2 * 2 + spT3 * 3 + spTPlus * 5;
    const avgDelay = spLeads.reduce((s, l) => s + l.untouched_hours, 0) / spLeads.length;

    let tag: string;
    if (severityScore === 0) tag = "Responsive";
    else if (severityScore <= 5) tag = "Delay Risk";
    else if (severityScore <= 15) tag = "Chronic Delayer";
    else tag = "Severe Backlog";

    return {
      name, total: spLeads.length,
      t1: spT1, t2: spT2, t3: spT3, tPlus: spTPlus,
      severityScore, avgDelay, tag,
    };
  });

  bySalesperson.sort((a, b) => b.severityScore - a.severityScore);

  return {
    total: leads.length,
    t1, t2, t3, tPlus,
    avgFirstTouchHours: avgHours,
    untouchedPercent: 0, // would need total leads count for this
    bySalesperson,
    bucketTrend: [
      { bucket: "T+1", count: t1 },
      { bucket: "T+2", count: t2 },
      { bucket: "T+3", count: t3 },
      { bucket: "T++", count: tPlus },
    ],
  };
}

export interface SalespersonStats {
  name: string;
  total: number;
  t1: number;
  t2: number;
  t3: number;
  tPlus: number;
  severityScore: number;
  avgDelay: number;
  tag: string;
}
