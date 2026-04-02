import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface AiMetricRow {
  id: string;
  ticket_id: string;
  used_rule: boolean;
  used_cache: boolean;
  used_code_context: boolean;
  code_context_length: number;
  ai_called: boolean;
  response_time_ms: number;
  confidence_score: number | null;
  resolution_type: string | null;
  created_at: string;
}

export interface MetricsFilters {
  dateFrom: string;
  dateTo: string;
  source: "all" | "rule" | "cache" | "ai";
}

export function useAiResolutionMetrics(filters: MetricsFilters) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["ai-resolution-metrics", filters],
    queryFn: async () => {
      let query = supabase
        .from("ai_resolution_metrics")
        .select("*")
        .gte("created_at", filters.dateFrom)
        .lte("created_at", filters.dateTo)
        .order("created_at", { ascending: false })
        .limit(500);

      if (filters.source === "rule") query = query.eq("used_rule", true);
      else if (filters.source === "cache") query = query.eq("used_cache", true);
      else if (filters.source === "ai") query = query.eq("ai_called", true);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as AiMetricRow[];
    },
    enabled: !!user,
  });
}

export function computeKpis(rows: AiMetricRow[]) {
  const total = rows.length;
  if (total === 0) {
    return {
      total: 0,
      aiPct: 0,
      cachePct: 0,
      rulePct: 0,
      avgConfidence: 0,
      avgResponseMs: 0,
    };
  }

  const aiCount = rows.filter((r) => r.ai_called).length;
  const cacheCount = rows.filter((r) => r.used_cache).length;
  const ruleCount = rows.filter((r) => r.used_rule).length;

  const confScores = rows
    .map((r) => r.confidence_score)
    .filter((c): c is number => c != null);
  const avgConfidence =
    confScores.length > 0
      ? confScores.reduce((a, b) => a + b, 0) / confScores.length
      : 0;

  const responseTimes = rows
    .map((r) => r.response_time_ms)
    .filter((t): t is number => t != null);
  const avgResponseMs =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

  return {
    total,
    aiPct: Math.round((aiCount / total) * 100),
    cachePct: Math.round((cacheCount / total) * 100),
    rulePct: Math.round((ruleCount / total) * 100),
    avgConfidence: Math.round(avgConfidence * 10) / 10,
    avgResponseMs: Math.round(avgResponseMs),
  };
}

export function computeCodeContextStats(rows: AiMetricRow[]) {
  const withCtx = rows.filter((r) => r.used_code_context);
  const withoutCtx = rows.filter((r) => !r.used_code_context);

  const avg = (arr: AiMetricRow[]) => {
    const scores = arr
      .map((r) => r.confidence_score)
      .filter((c): c is number => c != null);
    return scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : 0;
  };

  return {
    withContextPct:
      rows.length > 0 ? Math.round((withCtx.length / rows.length) * 100) : 0,
    avgConfWithCtx: avg(withCtx),
    avgConfWithoutCtx: avg(withoutCtx),
  };
}

export function computeDailyData(rows: AiMetricRow[]) {
  const byDate: Record<string, { count: number; confSum: number; confCount: number }> = {};

  for (const row of rows) {
    const d = row.created_at.substring(0, 10);
    if (!byDate[d]) byDate[d] = { count: 0, confSum: 0, confCount: 0 };
    byDate[d].count++;
    if (row.confidence_score != null) {
      byDate[d].confSum += row.confidence_score;
      byDate[d].confCount++;
    }
  }

  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      requests: v.count,
      avgConfidence: v.confCount > 0 ? Math.round((v.confSum / v.confCount) * 10) / 10 : 0,
    }));
}

export function computeSourceDistribution(rows: AiMetricRow[]) {
  const rule = rows.filter((r) => r.used_rule).length;
  const cache = rows.filter((r) => r.used_cache).length;
  const ai = rows.filter((r) => r.ai_called).length;

  return [
    { name: "Rule", value: rule, fill: "hsl(var(--chart-1))" },
    { name: "Cache", value: cache, fill: "hsl(var(--chart-2))" },
    { name: "AI", value: ai, fill: "hsl(var(--chart-3))" },
  ].filter((d) => d.value > 0);
}
