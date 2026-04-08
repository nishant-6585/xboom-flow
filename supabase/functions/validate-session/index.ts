import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-fingerprint",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "UNAUTHORIZED", message: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create user-scoped client for RLS
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "INVALID_TOKEN", message: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { action, stable_fingerprint, dynamic_fingerprint } = body;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Update last_seen_at for replay detection
    await supabaseAdmin
      .from("user_sessions")
      .update({ last_active_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("is_current", true);

    // Session binding: validate fingerprint if provided
    if (stable_fingerprint) {
      const { data: devices } = await supabaseAdmin
        .from("trusted_devices")
        .select("stable_fingerprint, dynamic_fingerprint")
        .eq("user_id", user.id)
        .eq("is_revoked", false)
        .gt("expires_at", new Date().toISOString());

      if (devices && devices.length > 0) {
        const stableMatch = devices.some(
          (d: any) => !d.stable_fingerprint || d.stable_fingerprint === stable_fingerprint
        );
        if (!stableMatch) {
          // Fingerprint mismatch → revoke session
          await supabaseAdmin
            .from("user_sessions")
            .update({
              is_active: false,
              is_current: false,
              revoked_at: new Date().toISOString(),
              revocation_reason: "FINGERPRINT_MISMATCH",
            })
            .eq("user_id", user.id)
            .eq("is_current", true);

          return new Response(
            JSON.stringify({ error: "SESSION_REVOKED", message: "Device fingerprint mismatch" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Step-up enforcement for sensitive actions
    const sensitiveActions = [
      "payroll_action", "bank_update", "role_change",
      "financial_approval", "salary_change", "permission_update",
    ];

    if (action && sensitiveActions.includes(action)) {
      const { data: needsStepUp } = await supabaseAdmin.rpc("needs_step_up_auth", {
        p_user_id: user.id,
      });

      if (needsStepUp === true) {
        return new Response(
          JSON.stringify({ error: "STEP_UP_REQUIRED", message: "Re-authentication required for this action" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ valid: true, user_id: user.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", message: "Validation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
