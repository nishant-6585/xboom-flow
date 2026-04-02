import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STANDARD_WORK_MINUTES = 480;

interface EmployeeMetric {
  employeeId: string;
  employeeName: string;
  department: string;
  totalPlannedMinutes: number;
  totalEntries: number;
  breakMinutes: number;
  gapMinutes: number;
  overlapMinutes: number;
  uniqueDays: number;
  avgDailyPlanned: number;
  utilizationPct: number;
  efficiencyScore: number;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function computeMetrics(
  employees: { id: string; name: string; department: string }[],
  entries: any[],
  templates: any[],
  department: string
): EmployeeMetric[] {
  const filtered = department === "all"
    ? employees
    : employees.filter((e) => e.department === department);

  return filtered
    .map((emp) => {
      const empEntries = entries.filter((e) => e.employee_id === emp.id);
      const empTemplates = templates.filter((t) => t.employee_id === emp.id);

      const totalPlannedMinutes = empEntries.reduce((s, e) => s + (e.duration_mins || 0), 0);
      const breakMinutes = empEntries.filter((e) => e.is_break).reduce((s, e) => s + (e.duration_mins || 0), 0);
      const uniqueDays = new Set(empEntries.map((e) => e.flow_date)).size;

      let gapMinutes = 0;
      let overlapMinutes = 0;
      const dayGroups: Record<string, any[]> = {};
      empEntries.forEach((e) => {
        if (!dayGroups[e.flow_date]) dayGroups[e.flow_date] = [];
        dayGroups[e.flow_date].push(e);
      });

      Object.values(dayGroups).forEach((dayEntries) => {
        const sorted = dayEntries.sort((a, b) => a.time_from.localeCompare(b.time_from));
        for (let i = 1; i < sorted.length; i++) {
          const prevEnd = timeToMinutes(sorted[i - 1].time_to);
          const currStart = timeToMinutes(sorted[i].time_from);
          if (prevEnd < currStart && currStart - prevEnd > 5) {
            gapMinutes += currStart - prevEnd;
          } else if (prevEnd > currStart) {
            overlapMinutes += prevEnd - currStart;
          }
        }
      });

      const avgDailyPlanned = uniqueDays > 0 ? totalPlannedMinutes / uniqueDays : 0;
      const utilizationPct = uniqueDays > 0
        ? Math.min(100, (avgDailyPlanned / STANDARD_WORK_MINUTES) * 100)
        : 0;

      const gapPenalty = Math.min(30, (gapMinutes / Math.max(1, totalPlannedMinutes)) * 100);
      const overlapPenalty = Math.min(20, (overlapMinutes / Math.max(1, totalPlannedMinutes)) * 100);
      const hasTemplate = empTemplates.length > 0 ? 10 : 0;
      const efficiencyScore = Math.max(0, Math.min(100,
        Math.round(utilizationPct * 0.6 + hasTemplate + (50 - gapPenalty - overlapPenalty))
      ));

      return {
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department || "Unassigned",
        totalPlannedMinutes,
        totalEntries: empEntries.length,
        breakMinutes,
        gapMinutes: Math.round(gapMinutes),
        overlapMinutes: Math.round(overlapMinutes),
        uniqueDays,
        avgDailyPlanned: Math.round(avgDailyPlanned),
        utilizationPct: Math.round(utilizationPct),
        efficiencyScore,
      };
    })
    .sort((a, b) => b.efficiencyScore - a.efficiencyScore);
}

function buildHeatmap(entries: any[]) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const grid: Record<string, Record<number, number>> = {};
  days.forEach((d) => {
    grid[d] = {};
    for (let h = 8; h <= 20; h++) grid[d][h] = 0;
  });

  entries.forEach((entry) => {
    const date = new Date(entry.flow_date);
    const dayIdx = (date.getDay() + 6) % 7;
    if (dayIdx >= 6) return;
    const dayName = days[dayIdx];
    const startHour = timeToMinutes(entry.time_from) / 60;
    const endHour = timeToMinutes(entry.time_to) / 60;
    for (let h = Math.floor(startHour); h < Math.ceil(endHour) && h <= 20; h++) {
      if (h >= 8) grid[dayName][h] = (grid[dayName][h] || 0) + 1;
    }
  });

  return { grid, days };
}

// Simple in-memory cache
const cache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

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

    // Check admin/hr role
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

    const { dateFrom, dateTo, department = "all" } = await req.json();
    if (!dateFrom || !dateTo) {
      return new Response(JSON.stringify({ error: "dateFrom and dateTo required" }), { status: 400, headers: corsHeaders });
    }

    // Check cache
    const cacheKey = `${dateFrom}_${dateTo}_${department}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch data
    const [empRes, entryRes, templateRes] = await Promise.all([
      adminClient.from("employees").select("id, name, department").eq("is_active", true).order("name"),
      adminClient.from("daily_flow_entries").select("employee_id, flow_date, duration_mins, is_break, time_from, time_to").gte("flow_date", dateFrom).lte("flow_date", dateTo),
      adminClient.from("daily_flow_templates").select("employee_id"),
    ]);

    const employees = empRes.data || [];
    const entries = entryRes.data || [];
    const templates = templateRes.data || [];

    const metrics = computeMetrics(employees, entries, templates, department);
    const heatmap = buildHeatmap(entries);

    const activeEmployees = metrics.filter((e) => e.uniqueDays > 0);
    const avgUtilization = activeEmployees.length > 0
      ? Math.round(activeEmployees.reduce((s, e) => s + e.utilizationPct, 0) / activeEmployees.length)
      : 0;
    const avgIdleTime = activeEmployees.length > 0
      ? Math.round(activeEmployees.reduce((s, e) => s + (STANDARD_WORK_MINUTES - e.avgDailyPlanned), 0) / activeEmployees.length)
      : 0;
    const totalGaps = activeEmployees.reduce((s, e) => s + e.gapMinutes, 0);

    const departments = [...new Set(employees.map((e) => e.department).filter(Boolean))].sort();

    // Dept distribution
    const deptMap: Record<string, number> = {};
    activeEmployees.forEach((e) => {
      deptMap[e.department] = (deptMap[e.department] || 0) + e.totalPlannedMinutes;
    });
    const deptDistribution = Object.entries(deptMap).map(([name, value]) => ({ name, value: Math.round(value / 60) }));

    const result = {
      metrics,
      summary: {
        avgUtilization,
        avgIdleTime,
        totalGaps,
        activeCount: activeEmployees.length,
        totalCount: metrics.length,
      },
      heatmap,
      departments,
      deptDistribution,
    };

    cache.set(cacheKey, { data: result, expiry: Date.now() + CACHE_TTL_MS });

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
