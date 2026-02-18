import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function lateThresholdHour(workStartTime: string, gracePeriodMinutes: number): number {
  const [h, m] = workStartTime.split(":").map(Number);
  return h + m / 60 + gracePeriodMinutes / 60;
}

function nowHourLocal(): number {
  // Server time is UTC — for IST add 5.5h; we use UTC here since attendance
  // timestamps are stored as UTC and compared consistently.
  const now = new Date();
  return now.getUTCHours() + now.getUTCMinutes() / 60;
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

// ─── Main ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const today = todayISO();
  const log: string[] = [];

  try {
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
      return new Response(JSON.stringify({ ok: true, log }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentHour = nowHourLocal();
    const lateAfterHour = lateThresholdHour(policy.work_start_time, policy.grace_period_minutes);

    // ─── A. Late Check-In Nudge ─────────────────────────────────────────────
    // Only trigger if current time > late threshold
    if (currentHour > lateAfterHour) {
      // Get all active approved employees who haven't checked in today
      const { data: employeesWithoutCheckin } = await supabase
        .from("employees")
        .select("id, user_id, name")
        .eq("is_active", true)
        .not("user_id", "is", null);

      const employeeUserIds = (employeesWithoutCheckin ?? [])
        .map((e) => e.user_id)
        .filter(Boolean);

      if (employeeUserIds.length > 0) {
        // Get employees who DID check in today
        const { data: checkedInLogs } = await supabase
          .from("attendance_logs")
          .select("employee_id")
          .eq("date", today)
          .not("check_in_time", "is", null);

        const checkedInEmployeeIds = new Set(
          (checkedInLogs ?? []).map((l) => l.employee_id)
        );

        // Get employees who already received a late nudge today
        const { data: existingLateNudges } = await supabase
          .from("attendance_notifications_log")
          .select("user_id")
          .eq("date", today)
          .eq("type", "late_nudge");

        const nudgedUserIds = new Set(
          (existingLateNudges ?? []).map((n) => n.user_id)
        );

        const toNudge = (employeesWithoutCheckin ?? []).filter(
          (e) =>
            e.user_id &&
            !checkedInEmployeeIds.has(e.id) &&
            !nudgedUserIds.has(e.user_id)
        );

        for (const employee of toNudge) {
          // Insert targeted notification (private to this user via user_id)
          const { error: notifErr } = await supabase.from("notifications").insert({
            type: "attendance_nudge",
            title: "👋 Haven't checked in yet",
            message:
              "You haven't checked in yet. If you're working today, please mark your attendance.",
            target_role: null,
            user_id: employee.user_id,
          });

          if (notifErr) {
            log.push(`[late_nudge] notif error for ${employee.name}: ${notifErr.message}`);
            continue;
          }

          // Log to prevent duplicate nudges today
          await supabase.from("attendance_notifications_log").insert({
            user_id: employee.user_id,
            date: today,
            type: "late_nudge",
          });

          log.push(`[late_nudge] sent to ${employee.name} (${employee.user_id})`);
        }
      }
    } else {
      log.push(`[late_nudge] skipped — current hour (${currentHour.toFixed(2)}) not past threshold (${lateAfterHour.toFixed(2)})`);
    }

    // ─── B. Long Break Nudge ────────────────────────────────────────────────
    // Get employees currently on break
    const { data: onBreakLogs } = await supabase
      .from("attendance_logs")
      .select("id, employee_id, break_start_time")
      .eq("date", today)
      .not("break_start_time", "is", null)
      .is("break_end_time", null)
      .not("check_out_time", "is", null); // only truly active breaks (no checkout)

    // Also catch employees on break without checkout
    const { data: onBreakLogs2 } = await supabase
      .from("attendance_logs")
      .select("id, employee_id, break_start_time")
      .eq("date", today)
      .not("break_start_time", "is", null)
      .is("break_end_time", null)
      .is("check_out_time", null);

    const allBreakLogs = [...(onBreakLogs ?? []), ...(onBreakLogs2 ?? [])];
    // Deduplicate by id
    const uniqueBreakLogs = Array.from(
      new Map(allBreakLogs.map((l) => [l.id, l])).values()
    );

    if (uniqueBreakLogs.length > 0) {
      // Get employees who already received a break nudge today
      const { data: existingBreakNudges } = await supabase
        .from("attendance_notifications_log")
        .select("user_id")
        .eq("date", today)
        .eq("type", "break_nudge");

      const breakNudgedUserIds = new Set(
        (existingBreakNudges ?? []).map((n) => n.user_id)
      );

      // For each employee on break, check if break exceeds warning threshold
      for (const log_entry of uniqueBreakLogs) {
        if (!log_entry.break_start_time) continue;

        const breakStart = new Date(log_entry.break_start_time);
        const breakMinutes = (Date.now() - breakStart.getTime()) / (1000 * 60);

        if (breakMinutes < policy.break_warning_minutes) {
          log.push(
            `[break_nudge] employee ${log_entry.employee_id} break at ${breakMinutes.toFixed(0)}m < threshold ${policy.break_warning_minutes}m`
          );
          continue;
        }

        // Get the user_id for this employee
        const { data: emp } = await supabase
          .from("employees")
          .select("user_id, name")
          .eq("id", log_entry.employee_id)
          .maybeSingle();

        if (!emp?.user_id) continue;
        if (breakNudgedUserIds.has(emp.user_id)) {
          log.push(`[break_nudge] already nudged ${emp.name} today`);
          continue;
        }

        // Send nudge
        const { error: notifErr } = await supabase.from("notifications").insert({
          type: "attendance_nudge",
          title: "☕ Break reminder",
          message:
            "Your break has exceeded the usual duration. Please resume work when ready.",
          target_role: null,
          user_id: emp.user_id,
        });

        if (notifErr) {
          log.push(`[break_nudge] notif error for ${emp.name}: ${notifErr.message}`);
          continue;
        }

        await supabase.from("attendance_notifications_log").insert({
          user_id: emp.user_id,
          date: today,
          type: "break_nudge",
        });

        log.push(`[break_nudge] sent to ${emp.name} (${emp.user_id}) after ${breakMinutes.toFixed(0)}m break`);
      }
    }

    return new Response(JSON.stringify({ ok: true, log }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[attendance-nudge]", message);
    return new Response(JSON.stringify({ ok: false, error: message, log }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
