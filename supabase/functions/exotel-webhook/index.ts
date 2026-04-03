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
        await supabase
          .from("call_logs")
          .update({
            call_status: internalStatus,
            call_duration: callDuration || undefined,
            recording_url: recordingUrl || undefined,
            end_time: endTime || new Date().toISOString(),
          } as any)
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
        await supabase.from("call_logs").insert({
          caller_number: fromNumber,
          call_status: internalStatus,
          call_type: "inbound",
          exotel_call_sid: callSid,
          call_duration: callDuration || null,
          recording_url: recordingUrl || null,
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
