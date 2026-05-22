// ElevenLabs Conversational AI webhook receiver
// POST /functions/v1/elevenlabs-call-summary
//
// Always returns 200 to avoid ElevenLabs retry loops.
// Stores raw payload in call_webhook_logs (source = 'elevenlabs')
// Creates (or updates within 24h) a call_logs lead + call_ai_analysis row
// with transcript, summary, extracted name/intent/budget, priority and score.

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

/**
 * Verify ElevenLabs HMAC signature.
 * ElevenLabs sends headers in the form: `t=<timestamp>,v0=<hex_signature>`.
 * The signed payload is `${timestamp}.${rawBody}` with HMAC-SHA256.
 * Returns true when the signature matches the secret. When the secret is not
 * configured, verification is skipped (the endpoint stays open) and a warning
 * is logged — set ELEVENLABS_WEBHOOK_SECRET in project secrets to enforce.
 */
async function verifyElevenLabsSignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");
  if (!secret) {
    console.warn(
      "[elevenlabs-call-summary] ELEVENLABS_WEBHOOK_SECRET not set — accepting unsigned webhook. Configure the secret to enforce signature verification.",
    );
    return true;
  }

  const header = req.headers.get("elevenlabs-signature") || req.headers.get("ElevenLabs-Signature");
  if (!header) return false;

  // Parse `t=...,v0=...` style header (also tolerate a bare hex signature).
  let timestamp: string | null = null;
  let provided: string | null = null;
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (!k || !v) continue;
    if (k.trim() === "t") timestamp = v.trim();
    else if (k.trim().startsWith("v")) provided = v.trim();
  }
  if (!provided) provided = header.trim();

  // Reject obviously stale timestamps (>5 min) when present.
  if (timestamp) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    const ageMs = Math.abs(Date.now() - (ts > 1e12 ? ts : ts * 1000));
    if (ageMs > 5 * 60 * 1000) return false;
  }

  const signedPayload = timestamp ? `${timestamp}.${rawBody}` : rawBody;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signedPayload));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Strip any v0= prefix from the provided signature for direct comparison.
  const providedHex = provided.replace(/^v0=/, "");
  if (computed.length !== providedHex.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ providedHex.charCodeAt(i);
  }
  return result === 0;
}

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

/** Normalise phone numbers to a best-effort E.164 string. */
function normalisePhone(raw: string | null): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/[\s\-()]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) {
    // 10-digit Indian mobile → assume +91; otherwise just prefix +.
    if (/^[6-9]\d{9}$/.test(s)) s = "+91" + s;
    else if (/^\d{11,15}$/.test(s)) s = "+" + s;
  }
  return /^\+\d{8,15}$/.test(s) ? s : raw.trim() || null;
}

/** Best-effort name extraction from transcript. */
function extractName(transcript: string): string | null {
  const patterns = [
    // Most specific first — full names with two capitalised words
    /\bmy name is ([A-Z][a-zA-Z]{1,20}\s[A-Z][a-zA-Z]{1,20})/,
    /\bname is ([A-Z][a-zA-Z]{1,20}\s[A-Z][a-zA-Z]{1,20})/,
    /\bthis is ([A-Z][a-zA-Z]{1,20}\s[A-Z][a-zA-Z]{1,20})/,
    /\b([A-Z][a-zA-Z]{1,20}\s[A-Z][a-zA-Z]{1,20})\s+(?:here|side|speaking|calling)/,
    /\bmy name is ([A-Z][a-zA-Z]{1,20}(?:\s[A-Z][a-zA-Z]{1,20})?)/i,
    /\bthis is ([A-Z][a-zA-Z]{1,20}(?:\s[A-Z][a-zA-Z]{1,20})?)/i,
    /\bi am ([A-Z][a-zA-Z]{1,20}(?:\s[A-Z][a-zA-Z]{1,20})?)/i,
    /\bi'm ([A-Z][a-zA-Z]{1,20}(?:\s[A-Z][a-zA-Z]{1,20})?)/i,
    /\bname[:\s]+([A-Z][a-zA-Z]{1,20}(?:\s[A-Z][a-zA-Z]{1,20})?)/i,
  ];
  for (const re of patterns) {
    const m = transcript.match(re);
    if (m?.[1]) {
      const n = m[1].trim();
      // filter common false positives
      if (
        !/^(calling|interested|looking|here|from|the|a|an|sure|okay|hello|hi|yes|no|agent|user|customer)$/i.test(
          n,
        )
      ) {
        return n;
      }
    }
  }
  return null;
}

/**
 * Extract a valid Indian mobile number from a transcript.
 * Looks for: +91XXXXXXXXXX, 91XXXXXXXXXX, 10-digit starting 6-9.
 * Prefers numbers spoken after "my number is / number is / contact".
 * Returns E.164 (+91XXXXXXXXXX) or null.
 */
function extractPhoneFromTranscript(transcript: string): string | null {
  if (!transcript) return null;

  const candidates: string[] = [];

  const cuePatterns = [
    /\bmy (?:number|mobile|phone|contact)(?:\s+is)?\s*[:\-]?\s*((?:\+?91[\s\-]?)?[6-9](?:[\s\-]?\d){9})/gi,
    /\b(?:number|mobile|phone|contact)(?:\s+is)?\s*[:\-]?\s*((?:\+?91[\s\-]?)?[6-9](?:[\s\-]?\d){9})/gi,
    /\bcall(?:\s+me)?\s+(?:on|at)\s*((?:\+?91[\s\-]?)?[6-9](?:[\s\-]?\d){9})/gi,
  ];
  for (const re of cuePatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(transcript)) !== null) {
      candidates.push(m[1]);
    }
  }

  // Generic mobile patterns (lower priority)
  const generic = [
    /\+91[\s\-]?[6-9](?:[\s\-]?\d){9}/g,
    /\b91[6-9]\d{9}\b/g,
    /\b[6-9]\d{9}\b/g,
  ];
  for (const re of generic) {
    const matches = transcript.match(re);
    if (matches) candidates.push(...matches);
  }

  for (const raw of candidates) {
    const digits = raw.replace(/\D/g, "");
    let mobile: string | null = null;
    if (digits.length === 10 && /^[6-9]/.test(digits)) mobile = digits;
    else if (digits.length === 12 && digits.startsWith("91") && /^91[6-9]/.test(digits))
      mobile = digits.slice(2);
    else if (digits.length === 13 && digits.startsWith("091") && /^091[6-9]/.test(digits))
      mobile = digits.slice(3);
    if (mobile && /^[6-9]\d{9}$/.test(mobile)) return `+91${mobile}`;
  }
  return null;
}

/** Categorise intent from transcript content. */
function extractIntent(t: string): string {
  const lc = t.toLowerCase();
  if (/\bdrone(s)?\b|\buav\b|\bquadcopter\b/.test(lc)) return "Drone";
  if (/\brobot(ic|ics|s)?\b/.test(lc)) return "Robotics";
  if (/\bai\b|\bautomation\b/.test(lc)) return "AI / Automation";
  return "General Inquiry";
}

/** Extract a budget hint like "1 lakh", "50000", "under 2 lakh". */
function extractBudget(t: string): string | null {
  const lc = t.toLowerCase();
  // "X lakh / lakhs / crore"
  const lakh = lc.match(/(?:under|around|about|upto|up to)?\s*(\d+(?:\.\d+)?)\s*(lakh|lakhs|crore|cr)\b/);
  if (lakh) return `${lakh[1]} ${lakh[2]}`;
  // "rs 50000", "₹50,000", "50k"
  const rs = lc.match(/(?:rs\.?|inr|₹)\s*([\d,]{3,})/);
  if (rs) return `₹${rs[1].replace(/,/g, "")}`;
  const k = lc.match(/\b(\d{2,4})\s*k\b/);
  if (k) return `₹${Number(k[1]) * 1000}`;
  const plain = lc.match(/\b(\d{4,7})\s*(?:rupees|inr)?\b/);
  if (plain && Number(plain[1]) >= 1000) return `₹${plain[1]}`;
  return null;
}

/** Compute priority + score from transcript signals. */
function computePriorityAndScore(t: string): { priority: string; score: number } {
  const lc = t.toLowerCase();
  const highSignals = ["buy", "purchase", "price", "quote", "quotation", "urgent", "order"];
  const medSignals = ["interested", "demo", "details", "information", "specification"];
  if (highSignals.some((w) => lc.includes(w))) return { priority: "High", score: 80 };
  if (medSignals.some((w) => lc.includes(w))) return { priority: "Medium", score: 50 };
  return { priority: "Low", score: 20 };
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

  // Verify the webhook came from ElevenLabs before doing anything else.
  const signatureValid = await verifyElevenLabsSignature(req, rawText);
  if (!signatureValid) {
    console.warn("[elevenlabs-call-summary] rejected unsigned/invalid webhook");
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(
    "[elevenlabs-call-summary] incoming webhook",
    JSON.stringify({
      keys: raw && typeof raw === "object" ? Object.keys(raw as object) : [],
      length: rawText.length,
    }),
  );

  try {
  // Initialise supabase with service role so we can insert across RLS.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Extract fields (tolerant to multiple ElevenLabs payload shapes).
  // Try ElevenLabs-specific paths first, then fall back to generic key search.
  const r = raw as any;
  const rawCallerId =
    asString(r?.data?.metadata?.phone_call?.external_number) ||
    asString(r?.metadata?.phone_call?.external_number) ||
    asString(r?.data?.phone_number) ||
    asString(r?.data?.user_id) ||
    asString(r?.data?.conversation_initiation_client_data?.dynamic_variables?.system__caller_id) ||
    asString(
      pick(raw, [
        "caller_id",
        "from_number",
        "from",
        "phone_number",
        "phone",
        "caller",
        "external_number",
        "user_id",
        "from_phone_number",
      ]),
    );
  // Carrier proxy / forwarding numbers used by MyOperator → ElevenLabs bridge.
  // When the webhook caller_id matches one of these, the real customer number
  // must come from the transcript instead.
  const PROXY_NUMBERS = new Set([
    "+917314599710",
  ]);
  const proxyCallerId = normalisePhone(rawCallerId);
  const conversationId = asString(
    pick(raw, ["conversation_id", "conversationId", "call_sid", "agent_response_id"]),
  );
  const transcript = buildTranscript(raw);
  // Extract real customer phone from transcript as early as possible so we can
  // prefer it over carrier proxy numbers.
  const extractedPhoneEarly = transcript ? extractPhoneFromTranscript(transcript) : null;
  const callerIsProxy = proxyCallerId ? PROXY_NUMBERS.has(proxyCallerId) : false;
  // Identity priority:
  //   1. transcript-extracted real number (when caller_id is a known proxy)
  //   2. transcript-extracted real number (when no caller_id at all)
  //   3. webhook caller_id (direct customer number)
  const callerId =
    (callerIsProxy && extractedPhoneEarly) ? extractedPhoneEarly :
    (!proxyCallerId && extractedPhoneEarly) ? extractedPhoneEarly :
    proxyCallerId;
  const summary = asString(
    pick(raw, [
      "summary",
      "transcript_summary",
      "call_summary",
      "conversation_summary",
      "call_summary_title",
    ]),
  );
  const durationRaw = pick(raw, [
    "call_duration_secs",
    "duration",
    "duration_secs",
    "call_duration_seconds",
  ]);
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

  // 2) Validate required fields. If no caller identity at all, we can't store
  //    a usable lead — mark invalid. Empty transcripts are now allowed
  //    (short / dropped calls still get a visible "No conversation" lead).
  if (!callerId) {
    const reason = "missing caller_id";
    console.warn("[elevenlabs-call-summary] validation failed:", reason);
    if (webhookLogId) {
      await supabase
        .from("call_webhook_logs")
        .update({ processing_status: "invalid", error_message: reason })
        .eq("id", webhookLogId);
    }
    return ok({ received: true, skipped: true, reason });
  }

  const safeTranscript = transcript ?? "";
  const noConversation = !transcript || safeTranscript.trim().length < 10;

  // 3) Lead intelligence — name, intent, budget, priority, score.
  const extractedName = transcript ? extractName(safeTranscript) : null;
  const extractedPhone = extractedPhoneEarly;
  const intent = transcript ? extractIntent(safeTranscript) : "No conversation captured";
  const budget = transcript ? extractBudget(safeTranscript) : null;
  const { priority, score } = transcript
    ? computePriorityAndScore(safeTranscript)
    : { priority: "Low", score: 0 };
  const extractedData = { name: extractedName, intent, budget, priority, score };

  const notes = noConversation
    ? `No conversation captured (call duration: ${callDuration ?? 0}s).${summary ? `\n\nSummary: ${summary}` : ""}`
    : summary
      ? `Summary: ${summary}\n\nTranscript:\n${safeTranscript}`
      : safeTranscript;

  // 4) Dedupe — look for an existing ElevenLabs lead from same caller in last 24h.
  let callLogId: string | null = null;
  let isUpdate = false;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from("call_logs")
      .select("id, notes, raw_transcript, customer_name, requirement, budget, priority, lead_score, call_duration")
      .eq("caller_number", callerId)
      .eq("lead_source", "ElevenLabs")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      isUpdate = true;
      callLogId = existing.id;
      const appendedNotes = `${existing.notes ?? ""}\n\n--- New call ${new Date().toISOString()} ---\n${notes}`;
      const appendedTranscript = `${existing.raw_transcript ?? ""}\n\n--- ${new Date().toISOString()} ---\n${safeTranscript || "(no conversation captured)"}`;

      // Only override existing fields when the new value is meaningful AND
      // the existing value is missing/weaker. Never downgrade a known lead
      // (e.g. don't replace "Piyush Sharma" with "Unknown" or High → Low).
      const priorityRank: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
      const existingNameIsReal =
        existing.customer_name &&
        existing.customer_name.trim() !== "" &&
        existing.customer_name.toLowerCase() !== "unknown";

      const updates: Record<string, unknown> = {
        notes: appendedNotes,
        raw_transcript: appendedTranscript,
        updated_at: new Date().toISOString(),
      };
      if (extractedName && !existingNameIsReal) updates.customer_name = extractedName;
      if (intent && !existing.requirement) updates.requirement = intent;
      if (budget && !existing.budget) updates.budget = budget;
      if (
        priority &&
        (priorityRank[priority] ?? 0) > (priorityRank[existing.priority ?? ""] ?? 0)
      ) {
        updates.priority = priority;
      }
      if (typeof score === "number" && score > (existing.lead_score ?? 0)) {
        updates.lead_score = score;
      }
      if (callDuration && callDuration > (existing.call_duration ?? 0)) {
        updates.call_duration = callDuration;
      }

      const { error: upErr } = await supabase
        .from("call_logs")
        .update(updates)
        .eq("id", existing.id);
      if (upErr) throw upErr;
      console.log("[elevenlabs-call-summary] call_logs updated existing lead", callLogId);
    } else {
      const { data, error } = await supabase
        .from("call_logs")
        .insert({
          call_id: conversationId,
          caller_number: callerId,
          full_number: callerId,
          call_status: "completed",
          call_type: "incoming",
          call_duration: callDuration ?? 0,
          customer_name: extractedName ?? "Unknown",
          lead_source: "ElevenLabs",
          requirement: intent,
          budget,
          lead_status: "New",
          priority,
          lead_score: score,
          raw_transcript: safeTranscript || null,
          notes,
          raw_payload: raw as never,
          lead_created: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      callLogId = data?.id ?? null;
      console.log("[elevenlabs-call-summary] call_logs insert ok", callLogId);
    }
  } catch (e) {
    console.error("[elevenlabs-call-summary] call_logs write failed:", e);
    if (webhookLogId) {
      await supabase
        .from("call_webhook_logs")
        .update({
          processing_status: "failed",
          error_message: `call_logs write: ${String(e)}`,
        })
        .eq("id", webhookLogId);
    }
    // Log into integration_errors but never crash.
    try {
      await supabase.from("integration_errors").insert({
        integration: "elevenlabs",
        function_name: "elevenlabs-call-summary",
        error_message: `call_logs write failed: ${String(e)}`,
        error_details: { caller: callerId, conversation_id: conversationId } as never,
      });
    } catch (_) { /* ignore */ }
    return ok({ received: true, error: "call_logs_write_failed" });
  }

  // 5) Insert AI analysis row (transcript + summary + extracted data).
  if (callLogId) {
    try {
      const { error } = await supabase.from("call_ai_analysis").insert({
        call_log_id: callLogId,
        transcript: safeTranscript || null,
        summary,
        intent,
        budget,
        extracted_data: extractedData as never,
        raw_ai_response: raw as never,
      });
      if (error) throw error;
      console.log("[elevenlabs-call-summary] call_ai_analysis insert ok");
    } catch (e) {
      // Non-fatal — call_logs already has the data in notes.
      console.error("[elevenlabs-call-summary] call_ai_analysis insert failed:", e);
    }
  }

  // 6) Mark webhook log as processed.
  if (webhookLogId) {
    await supabase
      .from("call_webhook_logs")
      .update({
        processing_status: "processed",
        error_message: extractedPhone ? `extracted_phone=${extractedPhone}` : null,
      })
      .eq("id", webhookLogId);
  }

  return ok({
    received: true,
    call_log_id: callLogId,
    updated: isUpdate,
    extracted: { ...extractedData, phone: extractedPhone },
  });
  } catch (fatal) {
    console.error("[elevenlabs-call-summary] FATAL:", fatal);
    try {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } },
      );
      await sb.from("integration_errors").insert({
        integration: "elevenlabs",
        function_name: "elevenlabs-call-summary",
        error_message: `fatal: ${String(fatal)}`,
        error_details: { stack: (fatal as Error)?.stack ?? null } as never,
      });
    } catch (_) { /* swallow */ }
    return ok({ received: true, error: "fatal" });
  }
});