import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-fingerprint, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── In-memory rate limiter (per-isolate) ──────────────────
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30; // max 30 calls per minute per user

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  bucket.count++;
  return bucket.count <= RATE_LIMIT;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "UNAUTHORIZED", message: "Missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticate user
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return json({ error: "INVALID_TOKEN", message: "Invalid or expired token" }, 401);
    }

    // Rate limit
    if (!checkRateLimit(user.id)) {
      return json({ error: "RATE_LIMITED", message: "Too many requests" }, 429);
    }

    const body = await req.json().catch(() => ({}));
    const { action, stable_fingerprint, user_agent } = body;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // ── 1. Check session is not revoked ──────────────────────
    const { data: currentSession } = await supabaseAdmin
      .from("user_sessions")
      .select("id, is_active, revoked_at, last_active_at, user_agent")
      .eq("user_id", user.id)
      .eq("is_current", true)
      .maybeSingle();

    if (!currentSession || currentSession.revoked_at || !currentSession.is_active) {
      return json({ error: "SESSION_REVOKED", message: "Session has been revoked" }, 403);
    }

    // ── 2. Anomaly detection ─────────────────────────────────
    // Detect rapid user_agent changes (possible token theft)
    if (user_agent && currentSession.user_agent) {
      const storedUA = (currentSession.user_agent as string) || "";
      if (storedUA && storedUA !== user_agent) {
        // UA changed — log anomaly, trigger step-up
        await supabaseAdmin.from("security_audit_log").insert({
          user_id: user.id,
          user_name: user.email || "unknown",
          action: "SESSION_ANOMALY_UA_CHANGE",
          details: JSON.stringify({
            previous_ua: storedUA.substring(0, 50),
            new_ua: user_agent.substring(0, 50),
            timestamp: new Date().toISOString(),
          }),
        });

        // Clear MFA freshness to force step-up on next sensitive action
        await supabaseAdmin.rpc("update_mfa_verified_at_to_null", {
          p_user_id: user.id,
        }).catch(() => {
          // Function may not exist yet — non-blocking
        });
      }
    }

    // Update last_active_at + user_agent
    await supabaseAdmin
      .from("user_sessions")
      .update({
        last_active_at: new Date().toISOString(),
        ...(user_agent ? { user_agent } : {}),
      })
      .eq("id", currentSession.id);

    // ── 3. Session binding: validate fingerprint ─────────────
    if (stable_fingerprint) {
      const { data: devices } = await supabaseAdmin
        .from("trusted_devices")
        .select("stable_fingerprint")
        .eq("user_id", user.id)
        .eq("is_revoked", false)
        .gt("expires_at", new Date().toISOString());

      if (devices && devices.length > 0) {
        const stableMatch = devices.some(
          (d: any) => !d.stable_fingerprint || d.stable_fingerprint === stable_fingerprint
        );
        if (!stableMatch) {
          // Mismatch → revoke session immediately
          await supabaseAdmin
            .from("user_sessions")
            .update({
              is_active: false,
              is_current: false,
              revoked_at: new Date().toISOString(),
              revocation_reason: "FINGERPRINT_MISMATCH",
            })
            .eq("id", currentSession.id);

          return json({ error: "SESSION_REVOKED", message: "Device fingerprint mismatch" }, 403);
        }
      }
    }

    // ── 4. Step-up enforcement for sensitive actions ──────────
    const sensitiveActions = [
      "payroll_action", "bank_update", "role_change",
      "financial_approval", "salary_change", "permission_update",
    ];

    if (action && sensitiveActions.includes(action)) {
      const { data: needsStepUp } = await supabaseAdmin.rpc("needs_step_up_auth", {
        p_user_id: user.id,
      });

      if (needsStepUp === true) {
        return json(
          { error: "STEP_UP_REQUIRED", message: "Re-authentication required for this action" },
          403
        );
      }
    }

    return json({ valid: true, user_id: user.id });
  } catch (_e) {
    return json({ error: "INTERNAL_ERROR", message: "Validation failed" }, 500);
  }
});
