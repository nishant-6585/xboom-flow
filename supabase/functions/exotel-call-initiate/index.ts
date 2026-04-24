import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXOTEL_SID = Deno.env.get("EXOTEL_SID");
const EXOTEL_API_KEY = Deno.env.get("EXOTEL_API_KEY");
const EXOTEL_API_TOKEN = Deno.env.get("EXOTEL_API_TOKEN");
const EXOTEL_CALLER_ID_ENV = Deno.env.get("EXOTEL_CALLER_ID");
const EXOTEL_FLOW_URL = Deno.env.get("EXOTEL_FLOW_URL");
const EXOTEL_STATUS_CALLBACK_URL_ENV = Deno.env.get("EXOTEL_STATUS_CALLBACK_URL");
const EXOTEL_TIME_LIMIT_ENV = Deno.env.get("EXOTEL_TIME_LIMIT"); // seconds
const EXOTEL_TIME_OUT_ENV = Deno.env.get("EXOTEL_TIME_OUT");     // seconds

// India region endpoint
const EXOTEL_API_BASE = "https://api.in.exotel.com";

/** Read an `app_settings` value safely */
async function readSetting<T = any>(
  supabaseAdmin: ReturnType<typeof createClient>,
  key: string
): Promise<T | null> {
  try {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    return (data?.value as T) ?? null;
  } catch {
    return null;
  }
}

/** Resolve Caller ID: DB override → env fallback */
async function resolveCallerId(
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<string | null> {
  const dbVal = await readSetting<{ caller_id?: string }>(
    supabaseAdmin,
    "exotel_caller_id"
  );
  const fromDb = dbVal?.caller_id?.trim();
  if (fromDb) return fromDb;
  return EXOTEL_CALLER_ID_ENV?.trim() || null;
}

/** Resolve numeric setting from DB → env → default */
async function resolveNumericSetting(
  supabaseAdmin: ReturnType<typeof createClient>,
  key: string,
  envValue: string | undefined,
  defaultValue: number
): Promise<number> {
  const dbVal = await readSetting<{ value?: number | string }>(supabaseAdmin, key);
  const fromDb = Number(dbVal?.value);
  if (Number.isFinite(fromDb) && fromDb > 0) return fromDb;
  const fromEnv = Number(envValue);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return defaultValue;
}

/** Resolve StatusCallback URL: DB → env → default to exotel-webhook */
async function resolveStatusCallback(
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<string> {
  const dbVal = await readSetting<{ url?: string }>(
    supabaseAdmin,
    "exotel_status_callback_url"
  );
  const fromDb = dbVal?.url?.trim();
  if (fromDb) return fromDb;
  if (EXOTEL_STATUS_CALLBACK_URL_ENV?.trim()) return EXOTEL_STATUS_CALLBACK_URL_ENV.trim();
  return `${SUPABASE_URL}/functions/v1/exotel-webhook`;
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

    // Validate base Exotel config (Caller ID resolved separately below)
    if (!EXOTEL_SID || !EXOTEL_API_KEY || !EXOTEL_API_TOKEN || !EXOTEL_FLOW_URL) {
      return new Response(
        JSON.stringify({ error: "Exotel not configured. Missing API credentials or Flow URL." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve Caller ID (DB → env fallback)
    const callerId = await resolveCallerId(supabaseAdmin);
    if (!callerId) {
      return new Response(
        JSON.stringify({ error: "Exotel Caller ID not configured. Set it in Admin → Integrations." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    // Initiate Exotel call — route to ElevenLabs Flow via Url param (India region)
    const exotelUrl = `${EXOTEL_API_BASE}/v1/Accounts/${EXOTEL_SID}/Calls/connect`;

    const formData = new URLSearchParams();
    // From = customer (the number Exotel will dial out to)
    formData.append("From", formattedPhone);
    // CallerId = your verified Exotel virtual number
    formData.append("CallerId", callerId);
    // Url = Exotel App / Flow that hands off to the ElevenLabs agent
    formData.append("Url", EXOTEL_FLOW_URL);
    formData.append("Record", "true");
    formData.append("StatusCallback", `${SUPABASE_URL}/functions/v1/exotel-webhook`);

    const authHeader = `Basic ${btoa(`${EXOTEL_API_KEY}:${EXOTEL_API_TOKEN}`)}`;
    let exotelResponse: Response;
    let responseText: string;
    try {
      const out = await exotelPostWithRetry(exotelUrl, formData.toString(), authHeader);
      exotelResponse = out.res;
      responseText = out.text;
    } catch (e: any) {
      await supabaseAdmin.from("integration_errors").insert({
        integration: "exotel",
        function_name: "exotel-call-initiate",
        error_message: `Exotel network/timeout: ${e?.message || "unknown"}`,
        error_details: { phone: formattedPhone },
      });
      return new Response(JSON.stringify({ error: "Exotel unreachable. Please retry." }), {
        status: 504,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
