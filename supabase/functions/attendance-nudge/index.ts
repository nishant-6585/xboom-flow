// @ts-nocheck
// TEMP: Disabled TypeScript checking due to Supabase Deno SDK type inference issue
// Do NOT remove until Database types are available in edge runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Timezone: IST = UTC+5:30 ──────────────────────────────────────────────
// All policy times (work_start_time) are in IST.
// Server runs UTC, so we offset by +5.5 hours for comparison.

const IST_OFFSET_HOURS = 5.5;

function nowHourIST(): number {
  const now = new Date();
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
  return (utcHours + IST_OFFSET_HOURS) % 24;
}

function todayISOinIST(): string {
  // Date in IST — shift UTC date by IST offset
  const now = new Date();
  const istMs = now.getTime() + IST_OFFSET_HOURS * 60 * 60 * 1000;
  return new Date(istMs).toISOString().split("T")[0];
}

function lateThresholdHour(workStartTime: string, gracePeriodMinutes: number): number {
  const [h, m] = workStartTime.split(":").map(Number);
  return h + m / 60 + gracePeriodMinutes / 60;
}

// ─── Main ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Authentication: require admin/hr JWT or cron secret
  const authHeader = req.headers.get("Authorization");
  const cronSecret = req.headers.get("X-Cron-Secret");
  const expectedCronSecret = Deno.env.get("CRON_SECRET");

  if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
    // Authenticated via cron secret
  } else if (authHeader?.startsWith("Bearer ")) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const checkClient = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await checkClient
      .from("user_roles")
      .select("role")
      .eq("user_id", claimsData.claims.sub)
      .in("role", ["admin", "hr"]);
    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const today = todayISOinIST();
  const log: string[] = [];
  const runStarted = new Date().toISOString();

  let lateNudgesSent = 0;
  let breakNudgesSent = 0;
  let employeesChecked = 0;
  let errorMessage: string | null = null;

  try {
    log.push(`[run] started at ${runStarted}, IST date: ${today}`);

    // 1. Load policy ─────────────────────────────────────────────────────────
    const { data: policyData } = await supabase
      .from("attendance_policy_settings")
      .select("work_start_time, grace_period_minutes, break_warning_minutes, employee_nudge_enabled")
      .limit(1)
      .maybeSingle();

    const policy = policyData ?? {
      work_start_time: "09:30:00",
      grace_period_minutes: 15,
      break_warning_minutes: 60,
      employee_nudge_enabled: false,
    };

    if (!policy.employee_nudge_enabled) {
      log.push("employee_nudge_enabled is false — skipping");
      await writeHealthLog(supabase, { lateNudgesSent, breakNudgesSent, employeesChecked, log });
      return jsonResponse({ ok: true, log });
    }

    const currentHourIST = nowHourIST();
    const lateAfterHour = lateThresholdHour(policy.work_start_time, policy.grace_period_minutes);

    log.push(`[time] IST hour: ${currentHourIST.toFixed(2)}, late threshold: ${lateAfterHour.toFixed(2)}`);

    // ─── A. Late Check-In Nudge ─────────────────────────────────────────────
    // Fix #1: Uses IST now — no more UTC mismatch
    // Fix #3: If HR manually added check_in_time, query excludes that employee automatically
    if (currentHourIST > lateAfterHour) {
      // Exclusion #1: skip on weekends (Sat/Sun per project working-days policy).
      // Compute the IST day-of-week (0=Sun..6=Sat).
      const nowIstMs = Date.now() + IST_OFFSET_HOURS * 60 * 60 * 1000;
      const istDow = new Date(nowIstMs).getUTCDay();
      if (istDow === 0 || istDow === 6) {
        log.push(`[late_nudge] skipped — weekend (IST dow=${istDow})`);
        await writeHealthLog(supabase, { lateNudgesSent, breakNudgesSent, employeesChecked, log });
        return jsonResponse({ ok: true, lateNudgesSent, breakNudgesSent, employeesChecked, log });
      }

      // Exclusion #2: skip on public holidays.
      const { data: holidayRow } = await supabase
        .from("holidays")
        .select("id, name")
        .eq("holiday_date", today)
        .eq("is_active", true)
        .maybeSingle();
      if (holidayRow) {
        log.push(`[late_nudge] skipped — public holiday (${holidayRow.name})`);
        await writeHealthLog(supabase, { lateNudgesSent, breakNudgesSent, employeesChecked, log });
        return jsonResponse({ ok: true, lateNudgesSent, breakNudgesSent, employeesChecked, log });
      }

      const { data: allActiveEmployees } = await supabase
        .from("employees")
        .select("id, user_id, name")
        .eq("is_active", true)
        .not("user_id", "is", null);

      employeesChecked = (allActiveEmployees ?? []).length;

      // Employees who already checked in today
      const { data: checkedInLogs } = await supabase
        .from("attendance_logs")
        .select("employee_id")
        .eq("date", today)
        .not("check_in_time", "is", null);

      const checkedInEmployeeIds = new Set(
        (checkedInLogs ?? []).map((l) => l.employee_id)
      );

      // Employees already nudged today for late check-in (reference_id IS NULL for late_nudge)
      const { data: existingLateNudges } = await supabase
        .from("attendance_notifications_log")
        .select("user_id")
        .eq("date", today)
        .eq("type", "late_nudge");

      const nudgedUserIds = new Set(
        (existingLateNudges ?? []).map((n) => n.user_id)
      );

      // Exclusion #3: skip employees on approved leave today
      // (covers full-day, half-day, WFH, comp-off — any approved leave_request
      // covering today means the employee isn't expected to check in normally).
      const { data: onLeaveRows } = await supabase
        .from("leave_requests")
        .select("employee_id")
        .eq("status", "approved")
        .lte("start_date", today)
        .gte("end_date", today);

      const onLeaveEmployeeIds = new Set(
        (onLeaveRows ?? []).map((r) => r.employee_id)
      );

      const toNudge = (allActiveEmployees ?? []).filter(
        (e) =>
          e.user_id &&
          !checkedInEmployeeIds.has(e.id) &&
          !onLeaveEmployeeIds.has(e.id) &&
          !nudgedUserIds.has(e.user_id)
      );

      log.push(`[late_nudge] ${toNudge.length} employees to nudge (${checkedInEmployeeIds.size} checked in, ${onLeaveEmployeeIds.size} on approved leave, ${nudgedUserIds.size} already nudged)`);

      for (const employee of toNudge) {
        const { error: notifErr } = await supabase.from("notifications").insert({
          type: "attendance_nudge",
          title: "👋 Haven't checked in yet",
          message: "You haven't checked in yet. If you're working today, please mark your attendance.",
          target_role: null,
          user_id: employee.user_id,
        });

        if (notifErr) {
          log.push(`[late_nudge] ❌ notif error for ${employee.name}: ${notifErr.message}`);
          continue;
        }

        await supabase.from("attendance_notifications_log").insert({
          user_id: employee.user_id,
          date: today,
          type: "late_nudge",
          reference_id: null, // Late nudge: one per day, no session reference needed
        });

        lateNudgesSent++;
        log.push(`[late_nudge] ✅ sent to ${employee.name}`);
      }
    } else {
      log.push(`[late_nudge] skipped — IST ${currentHourIST.toFixed(2)}h not past threshold ${lateAfterHour.toFixed(2)}h`);
    }

    // ─── B. Long Break Nudge ────────────────────────────────────────────────
    // Fix #2: Dedup is now per BREAK SESSION (reference_id = attendance_log.id),
    //         NOT once per day. Employee can get nudged once per break instance.

    const { data: onBreakLogs } = await supabase
      .from("attendance_logs")
      .select("id, employee_id, break_start_time")
      .eq("date", today)
      .not("break_start_time", "is", null)
      .is("break_end_time", null);

    const uniqueBreakLogs = (onBreakLogs ?? []);

    if (uniqueBreakLogs.length > 0) {
      // Get all break nudges sent today with their reference_id (attendance_log.id)
      const { data: existingBreakNudges } = await supabase
        .from("attendance_notifications_log")
        .select("user_id, reference_id")
        .eq("date", today)
        .eq("type", "break_nudge");

      // Key: "user_id::attendance_log_id" — unique per break session
      const nudgedSessionKeys = new Set(
        (existingBreakNudges ?? []).map((n) => `${n.user_id}::${n.reference_id}`)
      );

      for (const log_entry of uniqueBreakLogs) {
        if (!log_entry.break_start_time) continue;

        const breakStart = new Date(log_entry.break_start_time);
        const breakMinutes = (Date.now() - breakStart.getTime()) / (1000 * 60);

        if (breakMinutes < policy.break_warning_minutes) {
          log.push(
            `[break_nudge] attendance ${log_entry.id}: ${breakMinutes.toFixed(0)}m < threshold ${policy.break_warning_minutes}m`
          );
          continue;
        }

        const { data: emp } = await supabase
          .from("employees")
          .select("user_id, name")
          .eq("id", log_entry.employee_id)
          .maybeSingle();

        if (!emp?.user_id) continue;

        // Session key: this specific break session for this employee
        const sessionKey = `${emp.user_id}::${log_entry.id}`;
        if (nudgedSessionKeys.has(sessionKey)) {
          log.push(`[break_nudge] already nudged ${emp.name} for this session (${log_entry.id})`);
          continue;
        }

        const { error: notifErr } = await supabase.from("notifications").insert({
          type: "attendance_nudge",
          title: "☕ Break reminder",
          message: "Your break has exceeded the usual duration. Please resume work when ready.",
          target_role: null,
          user_id: emp.user_id,
        });

        if (notifErr) {
          log.push(`[break_nudge] ❌ notif error for ${emp.name}: ${notifErr.message}`);
          continue;
        }

        await supabase.from("attendance_notifications_log").insert({
          user_id: emp.user_id,
          date: today,
          type: "break_nudge",
          reference_id: log_entry.id, // ← Session-scoped: allows multiple breaks per day
        });

        breakNudgesSent++;
        log.push(`[break_nudge] ✅ sent to ${emp.name} after ${breakMinutes.toFixed(0)}m (session: ${log_entry.id})`);
      }
    } else {
      log.push("[break_nudge] no employees currently on break");
    }

    // Write health log for monitoring (Issue #4)
    await writeHealthLog(supabase, { lateNudgesSent, breakNudgesSent, employeesChecked, log });

    return jsonResponse({ ok: true, lateNudgesSent, breakNudgesSent, employeesChecked, log });

  } catch (err: unknown) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[attendance-nudge] fatal:", errorMessage);

    // Still write health log on failure so HR can see something went wrong
    await writeHealthLog(supabase, {
      lateNudgesSent,
      breakNudgesSent,
      employeesChecked,
      log,
      errorMessage,
    });

    return new Response(JSON.stringify({ ok: false, error: errorMessage, log }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function writeHealthLog(
  supabase: ReturnType<typeof createClient>,
  opts: {
    lateNudgesSent: number;
    breakNudgesSent: number;
    employeesChecked: number;
    log: string[];
    errorMessage?: string | null;
  }
) {
  try {
    await supabase.from("nudge_health_log").insert({
      late_nudges_sent: opts.lateNudgesSent,
      break_nudges_sent: opts.breakNudgesSent,
      employees_checked: opts.employeesChecked,
      error_message: opts.errorMessage ?? null,
      log_detail: { entries: opts.log },
    });
  } catch (e) {
    // Non-fatal — don't let health logging kill the main function
    console.error("[attendance-nudge] health log write failed:", e);
  }
}
