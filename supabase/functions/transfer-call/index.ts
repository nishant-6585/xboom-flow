import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXOTEL_SID = Deno.env.get("EXOTEL_SID");
const EXOTEL_API_KEY = Deno.env.get("EXOTEL_API_KEY");
const EXOTEL_API_TOKEN = Deno.env.get("EXOTEL_API_TOKEN");
const EXOTEL_CALLER_ID = Deno.env.get("EXOTEL_CALLER_ID");
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const MAX_RETRIES = 2;
const EXOTEL_TIMEOUT_MS = 10000;

interface TransferRequest {
  phone: string;
  call_id?: string;
  intent?: string;
}

function cleanPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  return digits.startsWith("91") ? digits : `91${digits}`;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callExotelRedirect(
  callSid: string,
  attempt: number
): Promise<{ ok: boolean; status: number; body: string }> {
  const url = `https://api.exotel.com/v1/Accounts/${EXOTEL_SID}/Calls/${callSid}`;
  const formData = new URLSearchParams();
  formData.append("Status", "completed");
  formData.append("Url", `http://my.exotel.com/${EXOTEL_SID}/exoml/start_voice/${EXOTEL_CALLER_ID}`);

  console.log(`[transfer-call] Exotel redirect attempt ${attempt + 1} for CallSid: ${callSid}`);

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${EXOTEL_API_KEY}:${EXOTEL_API_TOKEN}`)}`,
      },
      body: formData.toString(),
    },
    EXOTEL_TIMEOUT_MS
  );

  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Security: validate via Authorization header or X-Cron-Secret
    const authHeader = req.headers.get("Authorization");
    const cronSecret = req.headers.get("X-Cron-Secret");
    const apiKey = req.headers.get("x-api-key");

    let authenticated = false;

    // Allow cron secret or API key for ElevenLabs tool calls
    if (cronSecret && CRON_SECRET && cronSecret === CRON_SECRET) {
      authenticated = true;
    }
    if (apiKey && CRON_SECRET && apiKey === CRON_SECRET) {
      authenticated = true;
    }

    // Allow valid Supabase JWT
    if (!authenticated && authHeader) {
      const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error } = await supabaseUser.auth.getUser();
      if (!error && user) {
        authenticated = true;
      }
    }

    if (!authenticated) {
      console.log("[transfer-call] Unauthorized request rejected");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate Exotel config
    if (!EXOTEL_SID || !EXOTEL_API_KEY || !EXOTEL_API_TOKEN || !EXOTEL_CALLER_ID) {
      console.error("[transfer-call] Exotel credentials not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Telephony provider not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate request
    const body: TransferRequest = await req.json();
    console.log("[transfer-call] Incoming request:", {
      phone: body.phone ? `***${body.phone.slice(-4)}` : "missing",
      call_id: body.call_id || "none",
      intent: body.intent || "none",
    });

    if (!body.phone || typeof body.phone !== "string" || body.phone.trim().length < 5) {
      return new Response(
        JSON.stringify({ success: false, error: "Valid phone number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formattedPhone = cleanPhone(body.phone.trim());
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resolve CallSid: check call_logs for an active call from this phone
    let callSid: string | null = null;

    // First try by call_id if provided
    if (body.call_id) {
      const { data } = await supabaseAdmin
        .from("call_logs")
        .select("exotel_call_sid")
        .eq("exotel_call_sid", body.call_id)
        .eq("call_status", "initiated")
        .maybeSingle();
      if (data?.exotel_call_sid) {
        callSid = data.exotel_call_sid;
      }
    }

    // Fallback: find by phone number (most recent active call)
    if (!callSid) {
      const phoneVariants = [formattedPhone, formattedPhone.replace(/^91/, "")];
      const { data } = await supabaseAdmin
        .from("call_logs")
        .select("exotel_call_sid")
        .in("caller_number", phoneVariants)
        .in("call_status", ["initiated", "ringing", "in-progress"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.exotel_call_sid) {
        callSid = data.exotel_call_sid;
      }
    }

    if (!callSid) {
      console.log(`[transfer-call] No active CallSid found for phone: ***${formattedPhone.slice(-4)}`);

      // Log failure
      await supabaseAdmin.from("integration_errors").insert({
        integration: "exotel",
        function_name: "transfer-call",
        error_message: "CallSid not found for transfer request",
        error_details: { phone_suffix: formattedPhone.slice(-4), call_id: body.call_id || null },
      });

      return new Response(
        JSON.stringify({ success: false, error: "No active call found for this number" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[transfer-call] Resolved CallSid: ${callSid}`);

    // Call Exotel with retries
    let lastError: string | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await callExotelRedirect(callSid, attempt);
        console.log(`[transfer-call] Exotel response [${result.status}]: ${result.body.substring(0, 200)}`);

        if (result.ok) {
          // Update call status in DB
          await supabaseAdmin
            .from("call_logs")
            .update({ call_status: "transferring", notes: "Transfer to human agent initiated" } as any)
            .eq("exotel_call_sid", callSid);

          return new Response(
            JSON.stringify({ success: true, message: "Call transfer initiated" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        lastError = `Exotel API error: ${result.status} - ${result.body.substring(0, 200)}`;

        // Don't retry on 4xx client errors
        if (result.status >= 400 && result.status < 500) {
          break;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Unknown error";
        console.error(`[transfer-call] Attempt ${attempt + 1} failed:`, lastError);

        if (err instanceof DOMException && err.name === "AbortError") {
          lastError = "Exotel API timeout";
        }
      }

      // Wait before retry (exponential backoff)
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    // All retries exhausted
    console.error(`[transfer-call] All retries failed: ${lastError}`);
    await supabaseAdmin.from("integration_errors").insert({
      integration: "exotel",
      function_name: "transfer-call",
      error_message: `Transfer failed after retries: ${lastError}`,
      error_details: { call_sid: callSid, phone_suffix: formattedPhone.slice(-4) },
    });

    return new Response(
      JSON.stringify({ success: false, error: "Failed to initiate call transfer" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[transfer-call] Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
