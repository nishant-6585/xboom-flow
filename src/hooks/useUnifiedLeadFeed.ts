import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const LEAD_SOURCES = [
  "website",
  "forms",
  "google_ads",
  "interakt",
  "myoperator",
  "elevenlabs",
  "email",
  "facebook",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export interface UnifiedLead {
  source: LeadSource;
  source_row_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  subject_or_message: string | null;
  product_name: string | null;
  status: string | null;
  sales_person_id: string | null;
  sales_person_name: string | null;
  is_assigned: boolean;
  created_at: string;
  source_table: string;
  disposition: string;
  disposition_reason_code: string | null;
  disposition_reason_note: string | null;
  disposition_at: string | null;
  disposition_by_name: string | null;
}

export interface UseUnifiedLeadFeedParams {
  sources?: LeadSource[];
  search?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  page: number;
  pageSize: number;
  /** When false (default), hides qualified + not_qualified leads. */
  includeDispositioned?: boolean;
}

const FEED_KEY = "unified-lead-feed";
const COUNTS_KEY = "unified-lead-counts";

// Underlying source tables — used for realtime + counts (since views don't
// fire change events).
const SOURCE_TABLES: { source: LeadSource; table: string; filter?: string }[] = [
  { source: "website", table: "leads" },
  { source: "facebook", table: "leads", filter: "source=eq.Facebook Leads" },
  { source: "forms", table: "form_leads" },
  { source: "google_ads", table: "google_ads_leads" },
  { source: "interakt", table: "interakt_leads" },
  { source: "email", table: "email_leads" },
  { source: "myoperator", table: "call_logs", filter: "lead_source=neq.ElevenLabs" },
  { source: "elevenlabs", table: "call_logs", filter: "lead_source=eq.ElevenLabs" },
];

function escapeOr(v: string) {
  return v.replace(/[,()]/g, " ").trim();
}

export function useUnifiedLeadFeed(params: UseUnifiedLeadFeedParams) {
  const queryClient = useQueryClient();
  const { sources, search, status, startDate, endDate, page, pageSize, includeDispositioned } = params;

  const queryKey = useMemo(
    () => [
      FEED_KEY,
      { sources: sources?.slice().sort(), search, status, startDate, endDate, page, pageSize, includeDispositioned },
    ],
    [sources, search, status, startDate, endDate, page, pageSize, includeDispositioned],
  );

  const query = useQuery({
    queryKey,
    staleTime: 30_000,
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let q = supabase
        .from("unified_lead_feed" as any)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (sources && sources.length > 0) q = q.in("source", sources);
      if (status) q = q.eq("status", status);
      if (startDate) q = q.gte("created_at", startDate.toISOString());
      if (endDate) q = q.lte("created_at", endDate.toISOString());
      if (!includeDispositioned) {
        q = q.in("disposition", ["untouched", "prospect"]);
      }
      if (search && search.trim().length > 0) {
        const s = `%${escapeOr(search)}%`;
        q = q.or(
          `name.ilike.${s},email.ilike.${s},phone.ilike.${s},subject_or_message.ilike.${s},company.ilike.${s}`,
        );
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return {
        rows: (data ?? []) as unknown as UnifiedLead[],
        total: count ?? 0,
      };
    },
  });

  // Realtime: invalidate feed + counts on any insert across source tables.
  useEffect(() => {
    const channel = supabase.channel("unified-lead-feed-rt");
    for (const { table } of SOURCE_TABLES) {
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table },
        () => {
          queryClient.invalidateQueries({ queryKey: [FEED_KEY] });
          queryClient.invalidateQueries({ queryKey: [COUNTS_KEY] });
        },
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    rows: query.data?.rows ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useUnifiedLeadCounts(sinceIso?: string) {
  // Counts of rows per source created after `sinceIso` (defaults to last 24h).
  const since = sinceIso ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  return useQuery({
    queryKey: [COUNTS_KEY, since],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unified_lead_feed" as any)
        .select("source")
        .gte("created_at", since);
      if (error) throw error;
      const bySource: Record<LeadSource, number> = {
        website: 0,
        forms: 0,
        google_ads: 0,
        interakt: 0,
        myoperator: 0,
        elevenlabs: 0,
        email: 0,
        facebook: 0,
      };
      for (const row of ((data ?? []) as unknown as { source: LeadSource }[])) {
        if (row.source in bySource) bySource[row.source]++;
      }
      const totalNew = Object.values(bySource).reduce((a, b) => a + b, 0);
      return { bySource, totalNew };
    },
  });
}

export const SOURCE_META: Record<
  LeadSource,
  { label: string; chipClass: string }
> = {
  website: { label: "Website", chipClass: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  forms: { label: "Forms", chipClass: "bg-purple-500/15 text-purple-700 dark:text-purple-300" },
  google_ads: { label: "Google Ads", chipClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  interakt: { label: "Interakt", chipClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  myoperator: { label: "MyOperator", chipClass: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
  elevenlabs: { label: "ElevenLabs", chipClass: "bg-pink-500/15 text-pink-700 dark:text-pink-300" },
  email: { label: "Email", chipClass: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  facebook: { label: "Facebook Leads", chipClass: "bg-blue-600/15 text-blue-700 dark:text-blue-300" },
};