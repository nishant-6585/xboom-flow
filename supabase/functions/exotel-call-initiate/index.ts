import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXOTEL_SID = Deno.env.get("EXOTEL_SID");
const EXOTEL_API_KEY = Deno.env.get("EXOTEL_API_KEY");
const EXOTEL_API_TOKEN = Deno.env.get("EXOTEL_API_TOKEN");
const EXOTEL_CALLER_ID_ENV = Deno.env.get("EXOTEL_CALLER_ID");
const EXOTEL_FLOW_URL = Deno.env.get("EXOTEL_FLOW_URL");

// India region endpoint
const EXOTEL_API_BASE = "https://api.in.exotel.com";

/** Resolve Caller ID: prefer admin-configured DB value, fallback to env secret */
async function resolveCallerId(supabaseAdmin: ReturnType<typeof createClient>): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "exotel_caller_id")
      .maybeSingle();
    const dbVal = (data?.value as { caller_id?: string } | null)?.caller_id?.trim();
    if (dbVal) return dbVal;
  } catch {
    // fall through to env
  }
  return EXOTEL_CALLER_ID_ENV?.trim() || null;
}

/** POST to Exotel with one retry on 5xx / network failure */
async function exotelPostWithRetry(url: string, body: string, authHeader: string): Promise<{ res: Response; text: string }> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: authHeader,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const text = await res.text();
      if (res.ok || res.status < 500) return { res, text };
      // 5xx → retry once
      if (attempt === 2) return { res, text };
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
  // unreachable
  throw new Error("exotel_unreachable");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate Exotel config
    if (!EXOTEL_SID || !EXOTEL_API_KEY || !EXOTEL_API_TOKEN || !EXOTEL_CALLER_ID || !EXOTEL_FLOW_URL) {
      return new Response(JSON.stringify({ error: "Exotel not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      phone_number,
      // generic entity linkage (preferred)
      entity_type,
      entity_id,
      // backward-compat alias
      lead_id,
      salesperson_id,
    } = body;

    // Basic validation: digits only, 8–15 digits after stripping
    const digitsOnly = String(phone_number || "").replace(/\D/g, "");
    if (!phone_number || digitsOnly.length < 8 || digitsOnly.length > 15) {
      return new Response(JSON.stringify({ error: "Invalid phone_number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve entity linkage (preserve legacy lead_id behavior)
    const resolvedEntityType = entity_type || (lead_id ? "lead" : null);
    const resolvedEntityId = entity_id || lead_id || null;

    // Get salesperson info
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name")
      .eq("user_id", salesperson_id || user.id)
      .single();

    // Clean phone number — assume India if 10 digits
    const cleanPhone = digitsOnly.replace(/^0+/, "");
    const formattedPhone = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;

    // Initiate Exotel call — route to ElevenLabs Flow via Url param
    const exotelUrl = `https://api.exotel.com/v1/Accounts/${EXOTEL_SID}/Calls/connect`;

    const formData = new URLSearchParams();
    // From = customer (the number Exotel will dial out to)
    formData.append("From", formattedPhone);
    // CallerId = your verified Exotel virtual number
    formData.append("CallerId", EXOTEL_CALLER_ID);
    // Url = Exotel App / Flow that hands off to the ElevenLabs agent
    formData.append("Url", EXOTEL_FLOW_URL);
    formData.append("Record", "true");
    formData.append("StatusCallback", `${SUPABASE_URL}/functions/v1/exotel-webhook`);

    const exotelResponse = await fetch(exotelUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${EXOTEL_API_KEY}:${EXOTEL_API_TOKEN}`)}`,
      },
      body: formData.toString(),
    });

    const responseText = await exotelResponse.text();
    let callSid = "";

    try {
      // Exotel returns XML, try to extract CallSid
      const sidMatch = responseText.match(/<Sid>(.*?)<\/Sid>/);
      if (sidMatch) callSid = sidMatch[1];
    } catch {
      // If XML parsing fails, log it
    }

    if (!exotelResponse.ok) {
      // Log integration error
      await supabaseAdmin.from("integration_errors").insert({
        integration: "exotel",
        function_name: "exotel-call-initiate",
        error_message: `Exotel API error: ${exotelResponse.status}`,
        error_details: { status: exotelResponse.status, body: responseText },
      });

      return new Response(JSON.stringify({ error: "Failed to initiate call" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log the call in call_logs
    const { data: callLog, error: insertError } = await supabaseAdmin
      .from("call_logs")
      .insert({
        caller_number: formattedPhone,
        call_status: "initiated",
        call_type: "outbound",
        exotel_call_sid: callSid,
        lead_id: resolvedEntityType === "lead" ? resolvedEntityId : null,
        entity_type: resolvedEntityType,
        entity_id: resolvedEntityId,
        sales_person_id: salesperson_id || user.id,
        sales_person_name: profile?.name || "Unknown",
        lead_source: "exotel",
        start_time: new Date().toISOString(),
      } as any)
      .select()
      .single();

    if (insertError) {
      console.error("Failed to log call:", insertError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        call_sid: callSid,
        call_log_id: callLog?.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
