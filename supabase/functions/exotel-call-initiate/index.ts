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

function parseExotelErrorMessage(xml: string): string | null {
  const messageMatch = xml.match(/<Message>(.*?)<\/Message>/is);
  return messageMatch?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function mapExotelError(message: string | null, status: number): { code: string; userMessage: string } {
  const normalized = (message || "").toLowerCase();

  if (normalized.includes("could not find the callerid")) {
    return {
      code: "EXOTEL_INVALID_CALLER_ID",
      userMessage:
        "Exotel Caller ID is invalid or not enabled for outbound calls. Please update the verified Exotel number in Admin → Exotel settings.",
    };
  }

  if (normalized.includes("invalid call parameters")) {
    return {
      code: "EXOTEL_INVALID_PARAMETERS",
      userMessage: message || "Exotel rejected the call parameters.",
    };
  }

  if (status >= 500) {
    return {
      code: "EXOTEL_SERVICE_UNAVAILABLE",
      userMessage: "Exotel is temporarily unavailable. Please retry in a moment.",
    };
  }

  return {
    code: "EXOTEL_CALL_FAILED",
    userMessage: message || "Failed to initiate call.",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate JWT
    const reqAuthHeader = req.headers.get("Authorization");
    if (!reqAuthHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: reqAuthHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Role gate: outbound telephony costs money and can harass recipients.
    // Restrict to roles that actually own outbound calling — matches
    // `has_outbound_access()` intent elsewhere in the codebase.
    {
      const { data: roles } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", user.id);
      const allowed = new Set(["admin", "sales", "sales_manager", "supply_chain"]);
      const ok = (roles ?? []).some((r: { role: string }) => allowed.has(r.role));
      if (!ok) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Validate base Exotel config (Caller ID resolved separately below)
    if (!EXOTEL_SID || !EXOTEL_API_KEY || !EXOTEL_API_TOKEN || !EXOTEL_FLOW_URL) {
      return new Response(
        JSON.stringify({ error: "Exotel not configured. Missing API credentials or Flow URL." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enforce HTTPS for Exotel Flow URL (auto-upgrade http → https, reject anything else)
    let safeFlowUrl = EXOTEL_FLOW_URL.trim();
    if (safeFlowUrl.startsWith("http://")) {
      console.warn(
        "[exotel-call-initiate] EXOTEL_FLOW_URL uses http:// — auto-upgrading to https://. " +
        "Please update the secret to use https:// directly."
      );
      safeFlowUrl = "https://" + safeFlowUrl.slice("http://".length);
    } else if (!safeFlowUrl.startsWith("https://")) {
      await supabaseAdmin.from("integration_errors").insert({
        integration: "exotel",
        function_name: "exotel-call-initiate",
        error_message: "EXOTEL_FLOW_URL must start with https://",
        error_details: { flow_url: safeFlowUrl },
      });
      return new Response(
        JSON.stringify({ error: "Invalid EXOTEL_FLOW_URL: must use https://" }),
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

    // Resolve optional tunables (DB → env → default)
    const timeLimit = await resolveNumericSetting(
      supabaseAdmin,
      "exotel_time_limit",
      EXOTEL_TIME_LIMIT_ENV,
      14400
    );
    const timeOut = await resolveNumericSetting(
      supabaseAdmin,
      "exotel_time_out",
      EXOTEL_TIME_OUT_ENV,
      30
    );
    const statusCallbackUrl = await resolveStatusCallback(supabaseAdmin);

    const body = await req.json();
    const {
      phone_number,
      // generic entity linkage (preferred)
      entity_type,
      entity_id,
      // backward-compat alias
      lead_id,
      salesperson_id,
      // optional per-call overrides
      time_limit: timeLimitOverride,
      time_out: timeOutOverride,
      extra_metadata,
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

    // Build CustomField metadata (round-tripped via webhook so we can map calls back)
    const customFieldObj: Record<string, unknown> = {
      entity_type: resolvedEntityType,
      entity_id: resolvedEntityId,
      user_id: salesperson_id || user.id,
      user_name: profile?.name || "Unknown",
    };
    if (extra_metadata && typeof extra_metadata === "object") {
      Object.assign(customFieldObj, extra_metadata);
    }
    const customField = JSON.stringify(customFieldObj);

    // Resolve final tunables (per-call override wins, then DB/env, then default)
    const finalTimeLimit = Number(timeLimitOverride) > 0 ? Number(timeLimitOverride) : timeLimit;
    const finalTimeOut = Number(timeOutOverride) > 0 ? Number(timeOutOverride) : timeOut;

    // Initiate Exotel call — route to ElevenLabs Flow via Url param (India region)
    const exotelUrl = `${EXOTEL_API_BASE}/v1/Accounts/${EXOTEL_SID}/Calls/connect`;

    const formData = new URLSearchParams();
    // From = customer (the number Exotel will dial out to)
    formData.append("From", formattedPhone);
    // CallerId = your verified Exotel virtual number
    formData.append("CallerId", callerId);
    // Url = Exotel App / Flow that hands off to the ElevenLabs agent
    formData.append("Url", safeFlowUrl);
    // Transactional call (skip DND restrictions where applicable)
    formData.append("CallType", "trans");
    formData.append("Record", "true");
    formData.append("TimeLimit", String(finalTimeLimit));
    formData.append("TimeOut", String(finalTimeOut));
    formData.append("StatusCallback", statusCallbackUrl);
    formData.append("StatusCallbackContentType", "application/json");
    // Exotel /Calls/connect rejects StatusCallbackEvents for this endpoint,
    // so we only send the callback URL + content type.
    // CustomField is echoed back in the StatusCallback webhook
    formData.append("CustomField", customField);

    const exotelAuthHeader = `Basic ${btoa(`${EXOTEL_API_KEY}:${EXOTEL_API_TOKEN}`)}`;

    // Debug log of outbound request (no secrets)
    console.log("[exotel-call-initiate] Outbound request", {
      url: exotelUrl,
      from: formattedPhone,
      callerId,
      flowUrl: safeFlowUrl,
      timeLimit: finalTimeLimit,
      timeOut: finalTimeOut,
      statusCallbackUrl,
      customField: customFieldObj,
    });

    let exotelResponse: Response;
    let responseText: string;
    try {
      const out = await exotelPostWithRetry(exotelUrl, formData.toString(), exotelAuthHeader);
      exotelResponse = out.res;
      responseText = out.text;
    } catch (e: any) {
      await supabaseAdmin.from("integration_errors").insert({
        integration: "exotel",
        function_name: "exotel-call-initiate",
        error_message: `Exotel network/timeout: ${e?.message || "unknown"}`,
        error_details: { phone: formattedPhone, customField: customFieldObj },
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

    console.log("[exotel-call-initiate] Exotel response", {
      status: exotelResponse.status,
      ok: exotelResponse.ok,
      callSid,
      bodyPreview: responseText?.slice(0, 500),
    });

    if (!exotelResponse.ok) {
      const exotelMessage = parseExotelErrorMessage(responseText);
      const mappedError = mapExotelError(exotelMessage, exotelResponse.status);

      // Log integration error
      await supabaseAdmin.from("integration_errors").insert({
        integration: "exotel",
        function_name: "exotel-call-initiate",
        error_message: `Exotel API error: ${exotelResponse.status}`,
        error_details: {
          status: exotelResponse.status,
          exotel_message: exotelMessage,
          error_code: mappedError.code,
          body: responseText,
          request: {
            from: formattedPhone,
            callerId,
            timeLimit: finalTimeLimit,
            timeOut: finalTimeOut,
            customField: customFieldObj,
          },
        },
      });

      return new Response(JSON.stringify({
        success: false,
        error: mappedError.userMessage,
        code: mappedError.code,
      }), {
        status: 200,
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
        raw_payload: {
          request: {
            from: formattedPhone,
            callerId,
            url: safeFlowUrl,
            timeLimit: finalTimeLimit,
            timeOut: finalTimeOut,
            statusCallback: statusCallbackUrl,
            customField: customFieldObj,
          },
          response: {
            status: exotelResponse.status,
            body: responseText?.slice(0, 2000),
          },
        },
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
        time_limit: finalTimeLimit,
        time_out: finalTimeOut,
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
