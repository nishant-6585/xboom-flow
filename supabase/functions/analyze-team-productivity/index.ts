import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmployeeMetric {
  employeeId: string;
  employeeName: string;
  department: string;
  utilizationPct: number;
  efficiencyScore: number;
  gapMinutes: number;
  overlapMinutes: number;
  uniqueDays: number;
  avgDailyPlanned: number;
}

interface Insight {
  type: "underutilized" | "overloaded" | "trend" | "risk" | "optimization";
  message: string;
  impact: "low" | "medium" | "high";
  recommendation: string;
  affectedEmployees?: string[];
  actionType?: "reassign" | "apply_template" | "auto_optimize" | "review";
}

function generateInsights(
  currentMetrics: EmployeeMetric[],
  previousMetrics: EmployeeMetric[] | null
): { insights: Insight[]; trends: any } {
  const insights: Insight[] = [];
  const active = currentMetrics.filter((e) => e.uniqueDays > 0);

  // Underutilized employees
  const underUtilized = active.filter((e) => e.utilizationPct < 50);
  if (underUtilized.length > 0) {
    insights.push({
      type: "underutilized",
      message: `${underUtilized.length} employee${underUtilized.length > 1 ? "s are" : " is"} under-utilized (below 50%)`,
      impact: underUtilized.length >= 3 ? "high" : "medium",
      recommendation: "Consider reassigning tasks or applying templates to fill gaps in their schedules.",
      affectedEmployees: underUtilized.map((e) => e.employeeName),
      actionType: "apply_template",
    });
  }

  // Overloaded employees (burnout risk)
  const overloaded = active.filter((e) => e.utilizationPct > 85);
  if (overloaded.length > 0) {
    insights.push({
      type: "risk",
      message: `${overloaded.length} employee${overloaded.length > 1 ? "s" : ""} at burnout risk (utilization > 85%)`,
      impact: "high",
      recommendation: "Redistribute workload to prevent burnout. Consider moving tasks to under-utilized team members.",
      affectedEmployees: overloaded.map((e) => e.employeeName),
      actionType: "reassign",
    });
  }

  // High gaps
  const highGaps = active.filter((e) => e.gapMinutes > 60);
  if (highGaps.length > 0) {
    const totalGapHours = Math.round(highGaps.reduce((s, e) => s + e.gapMinutes, 0) / 60);
    insights.push({
      type: "optimization",
      message: `${totalGapHours} hours of schedule gaps detected across ${highGaps.length} employees`,
      impact: totalGapHours > 5 ? "high" : "medium",
      recommendation: "Use Auto Optimize to fill schedule gaps automatically with suggested tasks.",
      affectedEmployees: highGaps.map((e) => e.employeeName),
      actionType: "auto_optimize",
    });
  }

  // Overlaps
  const withOverlaps = active.filter((e) => e.overlapMinutes > 15);
  if (withOverlaps.length > 0) {
    insights.push({
      type: "optimization",
      message: `Schedule overlaps found for ${withOverlaps.length} employees`,
      impact: "medium",
      recommendation: "Review and adjust overlapping time slots to prevent task conflicts.",
      affectedEmployees: withOverlaps.map((e) => e.employeeName),
      actionType: "review",
    });
  }

  // No template
  const noTemplate = currentMetrics.filter((e) => e.efficiencyScore < 30 && e.uniqueDays === 0);
  if (noTemplate.length > 3) {
    insights.push({
      type: "underutilized",
      message: `${noTemplate.length} employees have no daily flow data at all`,
      impact: "medium",
      recommendation: "Assign templates from the Template Library to onboard them into the flow system.",
      affectedEmployees: noTemplate.slice(0, 5).map((e) => e.employeeName),
      actionType: "apply_template",
    });
  }

  // Trend comparison
  let trends: any = null;
  if (previousMetrics) {
    const prevActive = previousMetrics.filter((e) => e.uniqueDays > 0);
    const currAvgUtil = active.length > 0
      ? active.reduce((s, e) => s + e.utilizationPct, 0) / active.length
      : 0;
    const prevAvgUtil = prevActive.length > 0
      ? prevActive.reduce((s, e) => s + e.utilizationPct, 0) / prevActive.length
      : 0;

    const currAvgScore = active.length > 0
      ? active.reduce((s, e) => s + e.efficiencyScore, 0) / active.length
      : 0;
    const prevAvgScore = prevActive.length > 0
      ? prevActive.reduce((s, e) => s + e.efficiencyScore, 0) / prevActive.length
      : 0;

    const currTotalGaps = active.reduce((s, e) => s + e.gapMinutes, 0);
    const prevTotalGaps = prevActive.reduce((s, e) => s + e.gapMinutes, 0);

    trends = {
      utilization: {
        current: Math.round(currAvgUtil),
        previous: Math.round(prevAvgUtil),
        change: Math.round(currAvgUtil - prevAvgUtil),
      },
      efficiency: {
        current: Math.round(currAvgScore),
        previous: Math.round(prevAvgScore),
        change: Math.round(currAvgScore - prevAvgScore),
      },
      gaps: {
        current: currTotalGaps,
        previous: prevTotalGaps,
        change: currTotalGaps - prevTotalGaps,
      },
      activeEmployees: {
        current: active.length,
        previous: prevActive.length,
        change: active.length - prevActive.length,
      },
    };

    if (trends.utilization.change < -10) {
      insights.push({
        type: "trend",
        message: `Team utilization dropped by ${Math.abs(trends.utilization.change)}% compared to previous period`,
        impact: "high",
        recommendation: "Investigate cause of declining utilization. Check for missing templates or schedule issues.",
        actionType: "review",
      });
    } else if (trends.utilization.change > 10) {
      insights.push({
        type: "trend",
        message: `Team utilization improved by ${trends.utilization.change}% compared to previous period`,
        impact: "low",
        recommendation: "Great progress! Consider sharing best practices across teams.",
      });
    }
  }

  // Sort by impact
  const impactOrder = { high: 0, medium: 1, low: 2 };
  insights.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);

  return { insights, trends };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const userId = claimsData.claims.sub;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const userRoles = (roles || []).map((r) => r.role);
    if (!userRoles.includes("admin") && !userRoles.includes("hr")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const { currentMetrics, previousMetrics } = await req.json();

    if (!currentMetrics || !Array.isArray(currentMetrics)) {
      return new Response(JSON.stringify({ error: "currentMetrics array required" }), { status: 400, headers: corsHeaders });
    }

    const result = generateInsights(currentMetrics, previousMetrics || null);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
