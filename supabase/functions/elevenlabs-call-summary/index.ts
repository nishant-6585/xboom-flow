// ElevenLabs Conversational AI webhook receiver
// POST /functions/v1/elevenlabs-call-summary
//
// Always returns 200 to avoid ElevenLabs retry loops.
// Stores raw payload in call_webhook_logs (source = 'elevenlabs')
// Creates a call_logs row + call_ai_analysis row with transcript & summary.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, elevenlabs-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ok = (body: Record<string, unknown> = { received: true }) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Recursively walk an object and return the first defined value at any of the given keys. */
function pick(obj: unknown, keys: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const stack: unknown[] = [obj];
  const seen = new Set<unknown>();
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    for (const k of keys) {
      const v = (cur as Record<string, unknown>)[k];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    for (const v of Object.values(cur as Record<string, unknown>)) {
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return undefined;
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

/** Build a transcript string from common ElevenLabs shapes. */
function buildTranscript(payload: unknown): string | null {
  const direct = asString(pick(payload, ["transcript", "full_transcript"]));
  if (direct) return direct;

  const arr = pick(payload, ["transcript", "messages", "turns"]);
  if (Array.isArray(arr)) {
    const lines = arr
      .map((m) => {
        if (!m || typeof m !== "object") return null;
        const role =
          asString((m as any).role) ||
          asString((m as any).speaker) ||
          asString((m as any).source) ||
          "speaker";
        const text =
          asString((m as any).message) ||
          asString((m as any).text) ||
          asString((m as any).content);
        return text ? `${role}: ${text}` : null;
      })
      .filter(Boolean);
    if (lines.length) return lines.join("\n");
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Parse body defensively — never throw past this point.
  let raw: unknown = null;
  let rawText = "";
  try {
    rawText = await req.text();
    raw = rawText ? JSON.parse(rawText) : {};
  } catch (e) {
    console.error("[elevenlabs-call-summary] invalid JSON body:", e);
    raw = { _parse_error: String(e), _raw: rawText };
  }

  console.log(
    "[elevenlabs-call-summary] incoming webhook",
    JSON.stringify({
      keys: raw && typeof raw === "object" ? Object.keys(raw as object) : [],
      length: rawText.length,
    }),
  );

  // Initialise supabase with service role so we can insert across RLS.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Extract fields (tolerant to multiple ElevenLabs payload shapes).
  const callerId = asString(
    pick(raw, [
      "caller_id",
      "from_number",
      "from",
      "phone_number",
      "phone",
      "caller",
    ]),
  );
  const conversationId = asString(
    pick(raw, ["conversation_id", "conversationId", "id", "call_sid"]),
  );
  const transcript = buildTranscript(raw);
  const summary = asString(
    pick(raw, [
      "summary",
      "transcript_summary",
      "call_summary",
      "conversation_summary",
    ]),
  );
  const durationRaw = pick(raw, ["call_duration_secs", "duration", "duration_secs"]);
  const callDuration =
    typeof durationRaw === "number"
      ? Math.round(durationRaw)
      : Number.isFinite(Number(durationRaw))
        ? Math.round(Number(durationRaw))
        : null;

  console.log(
    "[elevenlabs-call-summary] extracted",
    JSON.stringify({
      callerId,
      conversationId,
      hasTranscript: !!transcript,
      hasSummary: !!summary,
      callDuration,
    }),
  );

  // 1) Always log raw payload for debugging — fire-and-forget but awaited so we capture id.
  let webhookLogId: string | null = null;
  try {
    const { data, error } = await supabase
      .from("call_webhook_logs")
      .insert({
        source: "elevenlabs",
        call_sid: conversationId,
        raw_payload: raw as never,
        processing_status: "received",
      })
      .select("id")
      .single();
    if (error) throw error;
    webhookLogId = data?.id ?? null;
  } catch (e) {
    console.error("[elevenlabs-call-summary] failed to log raw payload:", e);
  }

  // 2) Validate required fields. If invalid, mark webhook as failed but still 200.
  if (!callerId || !transcript) {
    const reason = !callerId
      ? "missing caller_id"
      : "missing transcript";
    console.warn("[elevenlabs-call-summary] validation failed:", reason);
    if (webhookLogId) {
      await supabase
        .from("call_webhook_logs")
        .update({ processing_status: "invalid", error_message: reason })
        .eq("id", webhookLogId);
    }
    return ok({ received: true, skipped: true, reason });
  }

  // 3) Insert call log (acts as the "lead" record in this CRM).
  let callLogId: string | null = null;
  try {
    const { data, error } = await supabase
      .from("call_logs")
      .insert({
        call_id: conversationId,
        caller_number: callerId,
        full_number: callerId,
        call_status: "completed",
        call_type: "incoming",
        call_duration: callDuration ?? 0,
        customer_name: "Unknown",
        lead_source: "ElevenLabs",
        notes: summary
          ? `Summary: ${summary}\n\nTranscript:\n${transcript}`
          : transcript,
        raw_payload: raw as never,
        lead_created: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    callLogId = data?.id ?? null;
    console.log("[elevenlabs-call-summary] call_logs insert ok", callLogId);
  } catch (e) {
    console.error("[elevenlabs-call-summary] call_logs insert failed:", e);
    if (webhookLogId) {
      await supabase
        .from("call_webhook_logs")
        .update({
          processing_status: "failed",
          error_message: `call_logs insert: ${String(e)}`,
        })
        .eq("id", webhookLogId);
    }
    return ok({ received: true, error: "call_logs_insert_failed" });
  }

  // 4) Insert AI analysis row (transcript + summary).
  if (callLogId) {
    try {
      const { error } = await supabase.from("call_ai_analysis").insert({
        call_log_id: callLogId,
        transcript,
        summary,
        raw_ai_response: raw as never,
      });
      if (error) throw error;
      console.log("[elevenlabs-call-summary] call_ai_analysis insert ok");
    } catch (e) {
      // Non-fatal — call_logs already has the data in notes.
      console.error("[elevenlabs-call-summary] call_ai_analysis insert failed:", e);
    }
  }

  // 5) Mark webhook log as processed.
  if (webhookLogId) {
    await supabase
      .from("call_webhook_logs")
      .update({ processing_status: "processed" })
      .eq("id", webhookLogId);
  }

  return ok({ received: true, call_log_id: callLogId });
});