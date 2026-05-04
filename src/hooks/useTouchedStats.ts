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
  customer_name: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SalespersonTouchStats {
  name: string;
  total: number;
  touched: number;
  untouched: number;
  touchedPct: number;
  followups: number;
  prospects: number;
  prospectsValue: number;
  pipeline: number;
  pipelineValue: number;
}

export interface TouchedStats {
  total: number;
  touched: number;
  untouched: number;
  touchedPct: number;
  bySalesperson: SalespersonTouchStats[];
  rows: NormalizedLead[];
  followupsTotal: number;
  prospectsTotal: number;
  prospectsValueTotal: number;
  pipelineTotal: number;
  pipelineValueTotal: number;
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
      const rows = await pull<any>("enquiries", "id, customer_name, sales_person_id, sales_person_name, status, notes, response_notes, lost_reason_notes, outcome_updated_at, created_at, updated_at");
      return rows.map((r) => ({
        id: r.id,
        sales_person_id: r.sales_person_id,
        sales_person_name: r.sales_person_name,
        touched: r.status !== "pending" || !!norm(r.notes) || !!r.response_notes || !!r.lost_reason_notes || !!r.outcome_updated_at,
        customer_name: r.customer_name ?? null,
        status: r.status ?? null,
        created_at: r.created_at ?? null,
        updated_at: r.updated_at ?? null,
      }));
    }
    case "qforms": {
      const rows = await pull<any>("leads", "id, name, assigned_to, assigned_to_name, status, form_type, created_at, updated_at");
      return rows.map((r) => ({
        id: r.id,
        sales_person_id: r.assigned_to,
        sales_person_name: r.assigned_to_name,
        touched: r.status !== "new",
        customer_name: r.name ?? null,
        status: r.status ?? null,
        created_at: r.created_at ?? null,
        updated_at: r.updated_at ?? null,
      }));
    }
    case "interakt": {
      const rows = await pull<any>("interakt_leads", "id, customer_name, sales_person_id, sales_person_name, status, notes, created_at, updated_at");
      return rows.map((r) => ({
        id: r.id,
        sales_person_id: r.sales_person_id,
        sales_person_name: r.sales_person_name,
        touched: r.status !== "new" || !!norm(r.notes),
        customer_name: r.customer_name ?? null,
        status: r.status ?? null,
        created_at: r.created_at ?? null,
        updated_at: r.updated_at ?? null,
      }));
    }
    case "myoperator":
    case "elevenlabs":
    case "call-tracker": {
      const rows = await pull<any>("call_logs", "id, customer_name, sales_person_id, sales_person_name, lead_status, notes, lead_created, created_at, updated_at");
      return rows.map((r) => ({
        id: r.id,
        sales_person_id: r.sales_person_id,
        sales_person_name: r.sales_person_name,
        touched: (r.lead_status && r.lead_status !== "New") || !!norm(r.notes) || r.lead_created === true,
        customer_name: r.customer_name ?? null,
        status: r.lead_status ?? null,
        created_at: r.created_at ?? null,
        updated_at: r.updated_at ?? null,
      }));
    }
    case "emails": {
      const rows = await pull<any>("email_leads", "id, customer_name, sales_person_id, sales_person_name, status, notes, created_at, updated_at");
      return rows.map((r) => ({
        id: r.id,
        sales_person_id: r.sales_person_id,
        sales_person_name: r.sales_person_name,
        touched: r.status !== "pending" || !!norm(r.notes),
        customer_name: r.customer_name ?? null,
        status: r.status ?? null,
        created_at: r.created_at ?? null,
        updated_at: r.updated_at ?? null,
      }));
    }
    case "form-leads": {
      const rows = await pull<any>("form_leads", "id, customer_name, sales_person_id, sales_person_name, status, notes, created_at, updated_at");
      return rows.map((r) => ({
        id: r.id,
        sales_person_id: r.sales_person_id,
        sales_person_name: r.sales_person_name,
        touched: r.status !== "new" || !!norm(r.notes),
        customer_name: r.customer_name ?? null,
        status: r.status ?? null,
        created_at: r.created_at ?? null,
        updated_at: r.updated_at ?? null,
      }));
    }
    case "google-ads": {
      const rows = await pull<any>("google_ads_leads", "id, customer_name, sales_person_id, sales_person_name, status, notes, created_at, updated_at");
      return rows.map((r) => ({
        id: r.id,
        sales_person_id: r.sales_person_id,
        sales_person_name: r.sales_person_name,
        touched: r.status !== "pending" || !!norm(r.notes),
        customer_name: r.customer_name ?? null,
        status: r.status ?? null,
        created_at: r.created_at ?? null,
        updated_at: r.updated_at ?? null,
      }));
    }
    case "xboom-website": {
      const rows = await pull<any>("woocommerce_orders", "id, customer_name, order_status, internal_notes, sales_notes, created_at, updated_at");
      return rows.map((r) => ({
        id: r.id,
        sales_person_id: null,
        sales_person_name: "Website",
        touched: !!norm(r.internal_notes) || !!norm(r.sales_notes) || (r.order_status && !["pending", "processing"].includes(r.order_status)),
        customer_name: r.customer_name ?? null,
        status: r.order_status ?? null,
        created_at: r.created_at ?? null,
        updated_at: r.updated_at ?? null,
      }));
    }
  }
  void all;
  void from;
  return [];
}

/** Maps a TouchedSource to the source_type value used in followups & prospects tables. */
const SOURCE_TYPE_MAP: Record<TouchedSource, string> = {
  enquiries: "enquiry",
  qforms: "lead",
  interakt: "interakt",
  myoperator: "myoperator",
  elevenlabs: "myoperator",
  "call-tracker": "myoperator",
  emails: "email",
  "form-leads": "form_lead",
  "google-ads": "google_ads",
  "xboom-website": "woocommerce",
};

interface ActivityRow {
  source_type: string;
  source_id: string;
  created_by_name: string | null;
  value?: number | null;
}

async function fetchActivity(
  source: TouchedSource,
  leadIds: Set<string>,
): Promise<{
  followups: ActivityRow[];
  prospects: ActivityRow[];
  pipeline: { sales_person_name: string | null; value: number; enquiry_id: string | null }[];
}> {
  const sourceType = SOURCE_TYPE_MAP[source];
  const PAGE = 1000;

  const pull = async <T>(table: string, select: string, filterCol: string, filterVal: string): Promise<T[]> => {
    const out: T[] = [];
    let f = 0;
    while (f < 50000) {
      const { data, error } = await (supabase as any)
        .from(table)
        .select(select)
        .eq(filterCol, filterVal)
        .range(f, f + PAGE - 1);
      if (error) throw error;
      const batch = (data ?? []) as T[];
      out.push(...batch);
      if (batch.length < PAGE) break;
      f += PAGE;
    }
    return out;
  };

  const [followupsRaw, prospectsRaw] = await Promise.all([
    pull<any>("followups", "source_type, source_id, created_by_name", "source_type", sourceType),
    pull<any>("prospects", "source_type, source_id, created_by_name, quoted_price", "source_type", sourceType),
  ]);

  const followups = followupsRaw
    .filter((r) => leadIds.has(String(r.source_id)))
    .map((r) => ({ source_type: r.source_type, source_id: r.source_id, created_by_name: r.created_by_name }));

  const prospects = prospectsRaw
    .filter((r) => leadIds.has(String(r.source_id)))
    .map((r) => ({
      source_type: r.source_type,
      source_id: r.source_id,
      created_by_name: r.created_by_name,
      value: Number(r.quoted_price ?? 0) || 0,
    }));

  // Pipeline orders only have a direct link via enquiry_id (for enquiries source)
  let pipeline: { sales_person_name: string | null; value: number; enquiry_id: string | null }[] = [];
  if (source === "enquiries" && leadIds.size > 0) {
    const ids = Array.from(leadIds);
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data, error } = await (supabase as any)
        .from("pipeline_orders")
        .select("sales_person_name, expected_price, quantity, enquiry_id")
        .in("enquiry_id", slice);
      if (error) throw error;
      (data ?? []).forEach((p: any) => {
        pipeline.push({
          sales_person_name: p.sales_person_name,
          value: (Number(p.expected_price ?? 0) || 0) * (Number(p.quantity ?? 1) || 1),
          enquiry_id: p.enquiry_id,
        });
      });
    }
  }

  return { followups, prospects, pipeline };
}

function aggregate(
  rows: NormalizedLead[],
  activity: { followups: ActivityRow[]; prospects: ActivityRow[]; pipeline: { sales_person_name: string | null; value: number }[] },
): TouchedStats {
  const total = rows.length;
  const touched = rows.filter((r) => r.touched).length;
  const untouched = total - touched;
  const map = new Map<string, SalespersonTouchStats>();
  const ensure = (name: string): SalespersonTouchStats => {
    const key = name?.trim() || "Unassigned";
    let cur = map.get(key);
    if (!cur) {
      cur = {
        name: key, total: 0, touched: 0, untouched: 0, touchedPct: 0,
        followups: 0, prospects: 0, prospectsValue: 0, pipeline: 0, pipelineValue: 0,
      };
      map.set(key, cur);
    }
    return cur;
  };

  for (const r of rows) {
    const cur = ensure(r.sales_person_name || "");
    cur.total += 1;
    if (r.touched) cur.touched += 1;
    else cur.untouched += 1;
  }

  for (const f of activity.followups) {
    ensure(f.created_by_name || "Unassigned").followups += 1;
  }
  for (const p of activity.prospects) {
    const cur = ensure(p.created_by_name || "Unassigned");
    cur.prospects += 1;
    cur.prospectsValue += p.value ?? 0;
  }
  for (const pl of activity.pipeline) {
    const cur = ensure(pl.sales_person_name || "Unassigned");
    cur.pipeline += 1;
    cur.pipelineValue += pl.value;
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
    rows,
    followupsTotal: activity.followups.length,
    prospectsTotal: activity.prospects.length,
    prospectsValueTotal: activity.prospects.reduce((a, b) => a + (b.value ?? 0), 0),
    pipelineTotal: activity.pipeline.length,
    pipelineValueTotal: activity.pipeline.reduce((a, b) => a + b.value, 0),
  };
}

export function useTouchedStats(source: TouchedSource) {
  return useQuery({
    queryKey: ["touched-stats", source, "v2"],
    queryFn: async () => {
      const rows = await fetchSource(source);
      const ids = new Set(rows.map((r) => String(r.id)));
      const activity = await fetchActivity(source, ids);
      return aggregate(rows, activity);
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60 * 1000,
  });
}