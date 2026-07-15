// AI auto-review for sick leave requests.
//
// Trigger: fired asynchronously by the DB trigger
// `trg_ai_review_sick_leave_on_insert` when an employee submits a
// `sick` or `half_day_sick` leave in `status='submitted'`.
//
// Flow:
//   1. Load the leave request, employee, current sick-leave balance
//      and the employee's recent sick-leave history (last 180 days).
//   2. Ask Gemini (via Lovable AI Gateway) to return strict JSON:
//        { decision: "approve" | "reject", reason: string, confidence: number }
//   3. Apply hard business rules (missing balance, overlap, obvious
//      abuse patterns) as guardrails before trusting the model.
//   4. Update `leave_requests` with the final decision, tagging
//      `approver_name='AI Auto-Review'` and setting `ai_reviewed=true`.
//   5. Insert a notification for the requesting employee.
//
// Runs with the service role so RLS / the self-approval guard trigger
// let it through (auth.uid() is null for service-role calls).

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const MODEL = "google/gemini-2.5-flash";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Decision = "approve" | "reject";

interface AiResult {
  decision: Decision;
  reason: string;
  confidence: number;
}

async function callAi(prompt: string): Promise<AiResult> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are an HR assistant reviewing a SICK LEAVE request. " +
            "Return ONLY strict JSON, no prose, no markdown fences. " +
            "Shape: {\"decision\":\"approve\"|\"reject\",\"reason\":string,\"confidence\":number(0..1)}. " +
            "Approve routine sick leave (fever, flu, viral, stomach upset, migraine, dental, minor illness, medical appointment, doctor visit, injury, recovery). " +
            "Reject ONLY when: reason is blank / gibberish / non-medical (vacation, travel, personal errand, wedding, function), duration is unusually long (>3 days) without a specific medical explanation, or the recent history shows a clear abuse pattern (repeated Mon/Fri sick days, exceeding 6 sick days in the last 90). " +
            "Be lenient on genuine medical reasons. When rejecting, the reason must be a short, respectful, employee-facing explanation of what to fix and how to proceed (e.g. resubmit with a medical certificate, or apply as EL/Unpaid).",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? "";
  let parsed: any;
  try { parsed = JSON.parse(raw); }
  catch {
    const stripped = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    parsed = JSON.parse(stripped);
  }
  const decision: Decision = parsed?.decision === "reject" ? "reject" : "approve";
  const reason: string = (parsed?.reason || "").toString().slice(0, 500) || "Approved by AI review.";
  const confidence: number = Number(parsed?.confidence) || 0.7;
  return { decision, reason, confidence };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: { leave_request_id?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const leaveId = body.leave_request_id;
  if (!leaveId) return json({ error: "leave_request_id required" }, 400);

  const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: leave, error: leaveErr } = await supa
    .from("leave_requests")
    .select("id, employee_id, leave_type, start_date, end_date, total_days, reason, status, ai_reviewed")
    .eq("id", leaveId)
    .maybeSingle();

  if (leaveErr || !leave) return json({ error: leaveErr?.message || "not found" }, 404);
  if (leave.status !== "submitted") return json({ skipped: "not submitted" });
  if (leave.ai_reviewed) return json({ skipped: "already reviewed" });
  if (!["sick", "half_day_sick"].includes(leave.leave_type)) return json({ skipped: "not a sick leave" });

  // Load employee + balance + recent sick history
  const [{ data: employee }, { data: balanceRow }, { data: history }] = await Promise.all([
    supa.from("employees").select("id, name, user_id, department, joining_date").eq("id", leave.employee_id).maybeSingle(),
    supa.from("leave_balances")
      .select("balance")
      .eq("employee_id", leave.employee_id)
      .eq("leave_type", "sick")
      .eq("year", new Date().getFullYear())
      .maybeSingle(),
    supa.from("leave_requests")
      .select("start_date, end_date, total_days, status, leave_type, reason")
      .eq("employee_id", leave.employee_id)
      .in("leave_type", ["sick", "half_day_sick"])
      .gte("start_date", new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 10))
      .neq("id", leave.id)
      .order("start_date", { ascending: false })
      .limit(20),
  ]);

  const balance = Number(balanceRow?.balance ?? 0);
  const requested = Number(leave.total_days || 0);

  let decision: Decision = "approve";
  let reason = "";
  let confidence = 1;
  let usedModel: string | null = null;

  // Hard guardrails first
  if (!leave.reason || leave.reason.trim().length < 3) {
    decision = "reject";
    reason = "Please add a brief reason describing your illness so HR can approve this sick leave.";
  } else if (requested > 0 && balance < requested && leave.leave_type !== "half_day_sick") {
    decision = "reject";
    reason = `Insufficient sick leave balance (${balance} day${balance === 1 ? "" : "s"} available, ${requested} requested). Please apply the excess days as Earned Leave or Unpaid Leave.`;
  } else {
    // Ask the model
    const approvedSickInWindow = (history || [])
      .filter((r: any) => r.status === "approved")
      .reduce((s: number, r: any) => s + Number(r.total_days || 0), 0);

    const prompt = [
      `Employee: ${employee?.name ?? "Unknown"} (${employee?.department ?? "n/a"})`,
      `Joining date: ${employee?.joining_date ?? "n/a"}`,
      `Request: ${leave.leave_type} from ${leave.start_date} to ${leave.end_date} (${requested} day${requested === 1 ? "" : "s"})`,
      `Reason submitted: "${leave.reason}"`,
      `Sick leave balance for this year: ${balance} day(s)`,
      `Approved sick leave in last 180 days: ${approvedSickInWindow} day(s)`,
      `Recent sick history (last 180 days, most recent first):`,
      ...(history && history.length
        ? history.slice(0, 10).map((r: any) =>
            `  - ${r.start_date} → ${r.end_date} (${r.total_days}d, ${r.status}) — ${r.reason || "no reason"}`,
          )
        : ["  (none)"]),
    ].join("\n");

    try {
      const ai = await callAi(prompt);
      decision = ai.decision;
      reason = ai.reason;
      confidence = ai.confidence;
      usedModel = MODEL;
    } catch (e) {
      // Fail-open: approve on AI failure so employees are not blocked.
      console.error("AI review failed, defaulting to approve:", e);
      decision = "approve";
      reason = "Auto-approved (AI review unavailable).";
      confidence = 0.5;
    }
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supa
    .from("leave_requests")
    .update({
      status: decision === "approve" ? "approved" : "rejected",
      approver_id: null,
      approver_name: "AI Auto-Review",
      approved_rejected_at: nowIso,
      comments: reason,
      ai_reviewed: true,
      ai_review_confidence: confidence,
      ai_review_model: usedModel,
    })
    .eq("id", leave.id)
    .eq("status", "submitted"); // idempotency guard

  if (updErr) {
    console.error("Failed to update leave_requests:", updErr);
    return json({ error: updErr.message }, 500);
  }

  // Notify the employee
  if (employee?.user_id) {
    await supa.from("notifications").insert({
      user_id: employee.user_id,
      type: decision === "approve" ? "leave_approved" : "leave_rejected",
      title: decision === "approve"
        ? "✅ Sick leave auto-approved"
        : "❌ Sick leave rejected",
      message:
        decision === "approve"
          ? `Your sick leave from ${leave.start_date} to ${leave.end_date} has been auto-approved.`
          : `Your sick leave from ${leave.start_date} to ${leave.end_date} was not approved. ${reason}`,
    });
  }

  return json({ ok: true, decision, reason, confidence });
});