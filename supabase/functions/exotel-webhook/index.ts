import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Shared-secret auth: require x-exotel-secret header (or ?secret= query
  // param) to match EXOTEL_WEBHOOK_SECRET env var. Configure the same value
  // in the Exotel webhook URL.
  if (req.method === "POST") {
    const expected = Deno.env.get("EXOTEL_WEBHOOK_SECRET");
    if (!expected) {
      console.error("EXOTEL_WEBHOOK_SECRET not configured — rejecting request");
      return new Response(JSON.stringify({ error: "server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const provided = req.headers.get("x-exotel-secret") || "";
    if (provided !== expected) {
      console.warn("Exotel webhook auth failed");
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    let payload: Record<string, any> = {};

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      payload = await req.json();
    } else if (contentType.includes("form")) {
      const formData = await req.formData();
      for (const [key, value] of formData.entries()) {
        payload[key] = value;
      }
    } else {
      const text = await req.text();
      try {
        payload = JSON.parse(text);
      } catch {
        // Try URL encoded
        const params = new URLSearchParams(text);
        for (const [key, value] of params.entries()) {
          payload[key] = value;
        }
      }
    }

    // Log raw webhook payload
    const callSid = payload.CallSid || payload.call_sid || payload.Sid || "";
    await supabase.from("call_webhook_logs").insert({
      source: "exotel",
      call_sid: callSid,
      raw_payload: payload,
      processing_status: "processing",
    });

    // Parse CustomField (round-tripped from exotel-call-initiate)
    let customMeta: Record<string, any> = {};
    const rawCustom = payload.CustomField ?? payload.custom_field ?? null;
    if (rawCustom) {
      if (typeof rawCustom === "string") {
        try { customMeta = JSON.parse(rawCustom); } catch { customMeta = { raw: rawCustom }; }
      } else if (typeof rawCustom === "object") {
        customMeta = rawCustom as Record<string, any>;
      }
    }

    console.log("[exotel-webhook] Event received", {
      callSid,
      status: payload.Status || payload.CallStatus,
      customMeta,
    });

    // Map Exotel status to internal status
    const exotelStatus = (payload.Status || payload.CallStatus || "").toLowerCase();
    let internalStatus = "initiated";
    if (["completed", "answered"].includes(exotelStatus)) internalStatus = "completed";
    else if (["busy", "no-answer", "failed", "canceled"].includes(exotelStatus)) internalStatus = "failed";
    else if (["ringing", "in-progress"].includes(exotelStatus)) internalStatus = "ringing";

    const recordingUrl = payload.RecordingUrl || payload.recording_url || null;
    const callDuration = parseInt(payload.Duration || payload.CallDuration || "0", 10);
    const endTime = payload.EndTime || payload.end_time || null;

    if (callSid) {
      // Try to update existing call_log by exotel_call_sid
      const { data: existingLog } = await supabase
        .from("call_logs")
        .select("id")
        .eq("exotel_call_sid", callSid)
        .maybeSingle();

      if (existingLog) {
        const updatePayload: Record<string, any> = {
          call_status: internalStatus,
          call_duration: callDuration || undefined,
          recording_url: recordingUrl || undefined,
          end_time: endTime || new Date().toISOString(),
        };
        // Backfill entity linkage from CustomField if missing
        if (customMeta?.entity_type) updatePayload.entity_type = customMeta.entity_type;
        if (customMeta?.entity_id) updatePayload.entity_id = customMeta.entity_id;
        if (customMeta?.entity_type === "lead" && customMeta?.entity_id) {
          updatePayload.lead_id = customMeta.entity_id;
        }
        await supabase
          .from("call_logs")
          .update(updatePayload as any)
          .eq("id", existingLog.id);

        // If recording available, trigger AI analysis asynchronously
        if (recordingUrl && internalStatus === "completed") {
          try {
            await fetch(`${SUPABASE_URL}/functions/v1/ai-call-analysis`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                call_log_id: existingLog.id,
                recording_url: recordingUrl,
              }),
            });
          } catch (e) {
            console.error("Failed to trigger AI analysis:", e);
          }
        }
      } else {
        // Create new call log from webhook data
        const fromNumber = payload.From || payload.CallFrom || "";
        // Phase 2: resolve sales_person_id via centralized agent_user_mapping if not pre-stamped
        let resolvedSalesPersonId: string | null = customMeta?.user_id || null;
        let resolverFallback: string = resolvedSalesPersonId ? "custom_field" : "none";
        const agentPhone = payload.To || payload.AgentNumber || payload.DialWhomNumber || null;
        if (!resolvedSalesPersonId && agentPhone) {
          try {
            const { data } = await supabase.rpc("resolve_agent_user", {
              _provider: "exotel",
              _agent_id: null,
              _agent_phone: String(agentPhone),
            });
            if (data) { resolvedSalesPersonId = data as string; resolverFallback = "agent_phone"; }
          } catch (e) {
            console.error("[exotel-webhook] resolve_agent_user failed:", e);
          }
        }
        console.log("[exotel-webhook] assignment debug", {
          agent_id: null,
          agent_phone: agentPhone,
          resolved_user_id: resolvedSalesPersonId,
          fallback_used: resolverFallback,
        });
        if (!resolvedSalesPersonId && agentPhone) {
          console.warn("UNMAPPED_AGENT", { provider: "exotel", agent_phone: agentPhone });
        }
        await supabase.from("call_logs").insert({
          caller_number: fromNumber,
          call_status: internalStatus,
          // If CustomField is present we know it was an outbound call we initiated
          call_type: customMeta?.entity_type ? "outbound" : "inbound",
          exotel_call_sid: callSid,
          call_duration: callDuration || null,
          recording_url: recordingUrl || null,
          entity_type: customMeta?.entity_type || null,
          entity_id: customMeta?.entity_id || null,
          lead_id: customMeta?.entity_type === "lead" ? customMeta?.entity_id : null,
          sales_person_id: resolvedSalesPersonId,
          sales_person_name: customMeta?.user_name || null,
          lead_source: "exotel",
          start_time: payload.StartTime || new Date().toISOString(),
          end_time: endTime || null,
          raw_payload: payload,
        } as any);
      }

      // Update webhook log status
      await supabase
        .from("call_webhook_logs")
        .update({ processing_status: "processed" })
        .eq("call_sid", callSid)
        .eq("processing_status", "processing");
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);

    // Log error
    await supabase.from("integration_errors").insert({
      integration: "exotel",
      function_name: "exotel-webhook",
      error_message: error instanceof Error ? error.message : "Unknown error",
      error_details: { stack: error instanceof Error ? error.stack : null },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, // Always return 200 to Exotel to prevent retries
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
