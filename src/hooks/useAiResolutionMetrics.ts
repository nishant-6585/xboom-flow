import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

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
  user_feedback: string | null;
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

export function useSubmitResolutionFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ticketId, feedback }: { ticketId: string; feedback: "helpful" | "not_helpful" }) => {
      // Find the metric row for this ticket and update it
      const { data: existing } = await supabase
        .from("ai_resolution_metrics")
        .select("id")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("ai_resolution_metrics")
          .update({ user_feedback: feedback } as Record<string, unknown>)
          .eq("id", existing.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-resolution-metrics"] });
      toast.success("Feedback recorded — thank you!");
    },
    onError: () => {
      toast.error("Failed to save feedback");
    },
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
      feedbackCount: 0,
      accuracyPct: 0,
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

  const withFeedback = rows.filter((r) => r.user_feedback);
  const helpful = withFeedback.filter((r) => r.user_feedback === "helpful").length;
  const feedbackCount = withFeedback.length;
  const accuracyPct = feedbackCount > 0 ? Math.round((helpful / feedbackCount) * 100) : 0;

  return {
    total,
    aiPct: Math.round((aiCount / total) * 100),
    cachePct: Math.round((cacheCount / total) * 100),
    rulePct: Math.round((ruleCount / total) * 100),
    avgConfidence: Math.round(avgConfidence * 10) / 10,
    avgResponseMs: Math.round(avgResponseMs),
    feedbackCount,
    accuracyPct,
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

// ─── Smart Alerts ────────────────────────────────────────────────────────
export interface SmartAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
}

export function computeSmartAlerts(kpis: ReturnType<typeof computeKpis>): SmartAlert[] {
  if (kpis.total === 0) return [];
  const alerts: SmartAlert[] = [];

  if (kpis.aiPct > 70) {
    alerts.push({
      id: "high-ai",
      severity: "warning",
      title: "Rules Underperforming",
      description: `${kpis.aiPct}% of requests hit the AI — consider adding more rule-based patterns to reduce cost.`,
    });
  }
  if (kpis.cachePct < 20 && kpis.total >= 5) {
    alerts.push({
      id: "low-cache",
      severity: "warning",
      title: "Cache Ineffective",
      description: `Only ${kpis.cachePct}% cache hit rate. Similar tickets aren't being reused — review error signatures.`,
    });
  }
  if (kpis.avgConfidence > 0 && kpis.avgConfidence < 60) {
    alerts.push({
      id: "low-confidence",
      severity: "critical",
      title: "Low AI Accuracy",
      description: `Average confidence is ${kpis.avgConfidence}%. Consider improving prompts or adding more context.`,
    });
  }
  if (kpis.avgResponseMs > 3000) {
    alerts.push({
      id: "slow-response",
      severity: "critical",
      title: "Performance Issue",
      description: `Average response time is ${kpis.avgResponseMs}ms. Check AI latency and code context fetch times.`,
    });
  }

  return alerts;
}

// ─── Insights & Recommendations ─────────────────────────────────────────
export interface Insight {
  type: "positive" | "neutral" | "negative";
  text: string;
}

export interface Recommendation {
  priority: "high" | "medium" | "low";
  text: string;
}

export function computeInsights(
  kpis: ReturnType<typeof computeKpis>,
  codeCtx: ReturnType<typeof computeCodeContextStats>
): Insight[] {
  if (kpis.total === 0) return [];
  const insights: Insight[] = [];

  if (kpis.rulePct >= 30) {
    insights.push({ type: "positive", text: `Rules handle ${kpis.rulePct}% of requests — efficient cost savings.` });
  } else if (kpis.rulePct > 0) {
    insights.push({ type: "neutral", text: `Rules handle only ${kpis.rulePct}% — room to add more pattern matches.` });
  }

  if (kpis.cachePct >= 30) {
    insights.push({ type: "positive", text: `Cache serves ${kpis.cachePct}% of requests — good reuse of past resolutions.` });
  }

  if (codeCtx.avgConfWithCtx > codeCtx.avgConfWithoutCtx && codeCtx.withContextPct > 0) {
    const delta = Math.round(codeCtx.avgConfWithCtx - codeCtx.avgConfWithoutCtx);
    insights.push({ type: "positive", text: `Code context boosts confidence by ${delta}% — GitHub integration is effective.` });
  } else if (codeCtx.avgConfWithCtx < codeCtx.avgConfWithoutCtx && codeCtx.withContextPct > 0) {
    insights.push({ type: "negative", text: `Code context isn't improving confidence — review file selection heuristics.` });
  }

  if (kpis.accuracyPct >= 80 && kpis.feedbackCount >= 3) {
    insights.push({ type: "positive", text: `${kpis.accuracyPct}% user approval rate — AI resolutions are well-received.` });
  } else if (kpis.accuracyPct < 50 && kpis.feedbackCount >= 3) {
    insights.push({ type: "negative", text: `Only ${kpis.accuracyPct}% approval — AI resolutions need quality improvement.` });
  }

  return insights;
}

export function computeRecommendations(
  kpis: ReturnType<typeof computeKpis>,
  codeCtx: ReturnType<typeof computeCodeContextStats>
): Recommendation[] {
  if (kpis.total === 0) return [];
  const recs: Recommendation[] = [];

  if (kpis.aiPct > 60) {
    recs.push({
      priority: "high",
      text: "Add new rule patterns for frequently occurring ticket types to reduce AI API costs.",
    });
  }

  if (kpis.cachePct < 15 && kpis.total >= 5) {
    recs.push({
      priority: "high",
      text: "Improve cache hit rate — normalize error signatures or extend cache TTL beyond 7 days.",
    });
  }

  if (kpis.avgConfidence > 0 && kpis.avgConfidence < 70) {
    recs.push({
      priority: "medium",
      text: "Tune AI prompts — add more structured context or examples to improve confidence scores.",
    });
  }

  if (codeCtx.withContextPct < 30 && kpis.aiPct > 30) {
    recs.push({
      priority: "medium",
      text: "Expand MODULE_FILE_MAP coverage so more AI calls benefit from code context.",
    });
  }

  if (kpis.avgResponseMs > 5000) {
    recs.push({
      priority: "high",
      text: "Response time is very high — consider parallel fetching or reducing max_tokens.",
    });
  }

  if (kpis.accuracyPct < 60 && kpis.feedbackCount >= 5) {
    recs.push({
      priority: "high",
      text: "User satisfaction is low — review rejected resolutions and improve prompt quality.",
    });
  }

  return recs;
}
