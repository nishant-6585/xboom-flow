import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TouchedSource =
  | "enquiries"
  | "qforms"
  | "interakt"
  | "myoperator"
  | "elevenlabs"
  | "xboom-website"
  | "call-tracker"
  | "emails"
  | "form-leads"
  | "google-ads";

export interface NormalizedLead {
  id: string;
  sales_person_id: string | null;
  sales_person_name: string | null;
  touched: boolean;
}

export interface SalespersonTouchStats {
  name: string;
  total: number;
  touched: number;
  untouched: number;
  touchedPct: number;
}

export interface TouchedStats {
  total: number;
  touched: number;
  untouched: number;
  touchedPct: number;
  bySalesperson: SalespersonTouchStats[];
}

/**
 * Fetches all rows for a given lead source and computes a "touched" flag.
 * Touched = the assigned salesperson has logged some activity / updated
 * any meaningful field on the lead (notes, status moved off default,
 * outcome recorded, etc.) — i.e. the lead is no longer in its raw,
 * untouched state.
 */
async function fetchSource(source: TouchedSource): Promise<NormalizedLead[]> {
  const PAGE = 1000;
  const all: NormalizedLead[] = [];
  let from = 0;
  const MAX = 50000;

  const pull = async <T>(table: string, select: string): Promise<T[]> => {
    const out: T[] = [];
    let f = 0;
    while (f < MAX) {
      const { data, error } = await (supabase as any)
        .from(table)
        .select(select)
        .range(f, f + PAGE - 1);
      if (error) throw error;
      const batch = (data ?? []) as T[];
      out.push(...batch);
      if (batch.length < PAGE) break;
      f += PAGE;
    }
    return out;
  };

  const norm = (s?: string | null) => (s ?? "").trim();

  switch (source) {
    case "enquiries": {
      const rows = await pull<any>("enquiries", "id, sales_person_id, sales_person_name, status, notes, response_notes, lost_reason_notes, outcome_updated_at");
      return rows.map((r) => ({
        id: r.id,
        sales_person_id: r.sales_person_id,
        sales_person_name: r.sales_person_name,
        touched: r.status !== "pending" || !!norm(r.notes) || !!r.response_notes || !!r.lost_reason_notes || !!r.outcome_updated_at,
      }));
    }
    case "qforms": {
      const rows = await pull<any>("leads", "id, assigned_to, assigned_to_name, status, form_type");
      return rows.map((r) => ({
        id: r.id,
        sales_person_id: r.assigned_to,
        sales_person_name: r.assigned_to_name,
        touched: r.status !== "new",
      }));
    }
    case "interakt": {
      const rows = await pull<any>("interakt_leads", "id, sales_person_id, sales_person_name, status, notes");
      return rows.map((r) => ({
        id: r.id,
        sales_person_id: r.sales_person_id,
        sales_person_name: r.sales_person_name,
        touched: r.status !== "new" || !!norm(r.notes),
      }));
    }
    case "myoperator":
    case "elevenlabs":
    case "call-tracker": {
      const rows = await pull<any>("call_logs", "id, sales_person_id, sales_person_name, lead_status, notes, lead_created");
      return rows.map((r) => ({
        id: r.id,
        sales_person_id: r.sales_person_id,
        sales_person_name: r.sales_person_name,
        touched: (r.lead_status && r.lead_status !== "New") || !!norm(r.notes) || r.lead_created === true,
      }));
    }
    case "emails": {
      const rows = await pull<any>("email_leads", "id, sales_person_id, sales_person_name, status, notes");
      return rows.map((r) => ({
        id: r.id,
        sales_person_id: r.sales_person_id,
        sales_person_name: r.sales_person_name,
        touched: r.status !== "pending" || !!norm(r.notes),
      }));
    }
    case "form-leads": {
      const rows = await pull<any>("form_leads", "id, sales_person_id, sales_person_name, status, notes");
      return rows.map((r) => ({
        id: r.id,
        sales_person_id: r.sales_person_id,
        sales_person_name: r.sales_person_name,
        touched: r.status !== "new" || !!norm(r.notes),
      }));
    }
    case "google-ads": {
      const rows = await pull<any>("google_ads_leads", "id, sales_person_id, sales_person_name, status, notes");
      return rows.map((r) => ({
        id: r.id,
        sales_person_id: r.sales_person_id,
        sales_person_name: r.sales_person_name,
        touched: r.status !== "pending" || !!norm(r.notes),
      }));
    }
    case "xboom-website": {
      const rows = await pull<any>("woocommerce_orders", "id, order_status, internal_notes, sales_notes");
      return rows.map((r) => ({
        id: r.id,
        sales_person_id: null,
        sales_person_name: "Website",
        touched: !!norm(r.internal_notes) || !!norm(r.sales_notes) || (r.order_status && !["pending", "processing"].includes(r.order_status)),
      }));
    }
  }
  void all;
  void from;
  return [];
}

function aggregate(rows: NormalizedLead[]): TouchedStats {
  const total = rows.length;
  const touched = rows.filter((r) => r.touched).length;
  const untouched = total - touched;
  const map = new Map<string, SalespersonTouchStats>();
  for (const r of rows) {
    const name = r.sales_person_name?.trim() || "Unassigned";
    const cur = map.get(name) ?? { name, total: 0, touched: 0, untouched: 0, touchedPct: 0 };
    cur.total += 1;
    if (r.touched) cur.touched += 1;
    else cur.untouched += 1;
    map.set(name, cur);
  }
  const bySalesperson = Array.from(map.values()).map((s) => ({
    ...s,
    touchedPct: s.total === 0 ? 0 : Math.round((s.touched / s.total) * 100),
  }));
  bySalesperson.sort((a, b) => b.total - a.total);
  return {
    total,
    touched,
    untouched,
    touchedPct: total === 0 ? 0 : Math.round((touched / total) * 100),
    bySalesperson,
  };
}

export function useTouchedStats(source: TouchedSource) {
  return useQuery({
    queryKey: ["touched-stats", source],
    queryFn: async () => aggregate(await fetchSource(source)),
    staleTime: 60_000,
    refetchInterval: 5 * 60 * 1000,
  });
}