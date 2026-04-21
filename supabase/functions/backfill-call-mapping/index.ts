// Backfills call_mapping for ElevenLabs leads that are unmatched or missing.
// Re-extracts phone/name from raw_transcript and re-tries match against MyOperator.
// POST /functions/v1/backfill-call-mapping  body: { limit?: number }

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    while ((m = re.exec(transcript)) !== null) candidates.push(m[1]);
  }
  for (const re of [/\+91[\s\-]?[6-9](?:[\s\-]?\d){9}/g, /\b91[6-9]\d{9}\b/g, /\b[6-9]\d{9}\b/g]) {
    const matches = transcript.match(re);
    if (matches) candidates.push(...matches);
  }
  for (const raw of candidates) {
    const digits = raw.replace(/\D/g, "");
    let mobile: string | null = null;
    if (digits.length === 10 && /^[6-9]/.test(digits)) mobile = digits;
    else if (digits.length === 12 && digits.startsWith("91") && /^91[6-9]/.test(digits)) mobile = digits.slice(2);
    else if (digits.length === 13 && digits.startsWith("091") && /^091[6-9]/.test(digits)) mobile = digits.slice(3);
    if (mobile && /^[6-9]\d{9}$/.test(mobile)) return `+91${mobile}`;
  }
  return null;
}

function extractName(transcript: string): string | null {
  const patterns = [
    /\bmy name is ([A-Z][a-zA-Z]{1,20}\s[A-Z][a-zA-Z]{1,20})/,
    /\bthis is ([A-Z][a-zA-Z]{1,20}\s[A-Z][a-zA-Z]{1,20})/,
    /\bmy name is ([A-Z][a-zA-Z]{1,20})/i,
    /\bthis is ([A-Z][a-zA-Z]{1,20})/i,
    /\bi am ([A-Z][a-zA-Z]{1,20})/i,
  ];
  for (const re of patterns) {
    const m = transcript.match(re);
    if (m?.[1]) {
      const n = m[1].trim();
      if (!/^(calling|interested|here|sure|okay|hello|hi|yes|no|agent|user|customer)$/i.test(n)) return n;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  let body: { limit?: number } = {};
  try { body = await req.json(); } catch { /* allow empty body */ }
  const limit = Math.min(Math.max(body.limit ?? 50, 1), 200);

  // Fetch ElevenLabs leads that have no mapping or are UNMATCHED
  const { data: leads, error } = await supabase
    .from("call_logs")
    .select("id, caller_number, customer_name, raw_transcript, created_at, call_duration")
    .eq("lead_source", "ElevenLabs")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results = { processed: 0, matched_transcript: 0, matched_time: 0, unmatched: 0 };

  for (const lead of leads ?? []) {
    const transcript = lead.raw_transcript ?? "";
    const extractedPhone = extractPhoneFromTranscript(transcript);
    const extractedName = extractName(transcript);
    let matchType: "TRANSCRIPT_MATCH" | "TIME_MATCH" | "UNMATCHED" = "UNMATCHED";
    let matchConfidence = 0;
    let myopId: string | null = null;

    if (extractedPhone) {
      const lastTen = extractedPhone.slice(-10);
      // Legacy MyOperator rows may have lead_source = NULL. Match any non-
      // ElevenLabs row (i.e. came through the phone system).
      const { data: byPhone } = await supabase
        .from("call_logs")
        .select("id, customer_name, caller_number, created_at, lead_source")
        .or(`lead_source.is.null,lead_source.neq.ElevenLabs`)
        .or(`caller_number.eq.${extractedPhone},caller_number.like.%${lastTen}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byPhone?.id) {
        myopId = byPhone.id;
        matchType = "TRANSCRIPT_MATCH";
        matchConfidence = 95;
        if (extractedName) {
          const existingName = byPhone.customer_name?.trim().toLowerCase();
          if (!existingName || existingName === "unknown") {
            await supabase.from("call_logs").update({ customer_name: extractedName }).eq("id", byPhone.id);
          }
        }
      }
    }

    if (matchType === "UNMATCHED") {
      const created = new Date(lead.created_at);
      const winStart = new Date(created.getTime() - 5 * 60 * 1000).toISOString();
      const winEnd = new Date(created.getTime() + 5 * 60 * 1000).toISOString();
      const { data: candidates } = await supabase
        .from("call_logs")
        .select("id, created_at, call_duration, lead_source")
        .or(`lead_source.is.null,lead_source.neq.ElevenLabs`)
        .gte("created_at", winStart)
        .lte("created_at", winEnd)
        .limit(20);
      if (candidates?.length) {
        let best: { id: string; conf: number } | null = null;
        for (const c of candidates) {
          const tDiff = Math.abs(new Date(c.created_at).getTime() - created.getTime()) / 1000;
          const dDiff = lead.call_duration && c.call_duration
            ? Math.abs(lead.call_duration - c.call_duration) : 999;
          if (tDiff <= 60 && dDiff <= 30) {
            const conf = Math.round(85 - tDiff * 0.2 - dDiff * 0.3);
            if (!best || conf > best.conf) best = { id: c.id, conf };
          }
        }
        if (best) {
          myopId = best.id;
          matchType = "TIME_MATCH";
          matchConfidence = Math.max(70, Math.min(85, best.conf));
        }
      }
    }

    await supabase.from("call_mapping").upsert({
      elevenlabs_call_log_id: lead.id,
      myoperator_call_log_id: myopId,
      match_type: matchType,
      match_confidence: matchConfidence,
      extracted_phone_number: extractedPhone,
      extracted_name: extractedName,
      matched_at: matchType !== "UNMATCHED" ? new Date().toISOString() : null,
    }, { onConflict: "elevenlabs_call_log_id" });

    results.processed++;
    if (matchType === "TRANSCRIPT_MATCH") results.matched_transcript++;
    else if (matchType === "TIME_MATCH") results.matched_time++;
    else results.unmatched++;
  }

  return new Response(JSON.stringify({ ok: true, ...results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});