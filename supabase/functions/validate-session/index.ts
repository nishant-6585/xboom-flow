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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // ── 1. DB-backed rate limiting ───────────────────────────
    const { data: allowed } = await supabaseAdmin.rpc("check_rate_limit", {
      p_key: `validate_session:${user.id}`,
      p_max_requests: 30,
      p_window_ms: 60000,
    });

    if (allowed === false) {
      return json({ error: "RATE_LIMITED", message: "Too many requests" }, 429);
    }

    const body = await req.json().catch(() => ({}));
    const { action, stable_fingerprint, user_agent } = body;

    // Derive IP from headers (Deno Deploy / reverse proxy)
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      "unknown";

    // ── 2. Check session is not revoked ──────────────────────
    const { data: currentSession } = await supabaseAdmin
      .from("user_sessions")
      .select("id, is_active, revoked_at, last_active_at, user_agent, last_ip, session_version")
      .eq("user_id", user.id)
      .eq("is_current", true)
      .maybeSingle();

    if (!currentSession || currentSession.revoked_at || !currentSession.is_active) {
      return json({ error: "SESSION_REVOKED", message: "Session has been revoked" }, 403);
    }

    // ── 3. IP anomaly detection ──────────────────────────────
    if (clientIp !== "unknown" && currentSession.last_ip) {
      const previousIp = currentSession.last_ip as string;
      if (previousIp && previousIp !== clientIp) {
        // Check how recently the IP changed (rapid change = suspicious)
        const lastActiveAt = new Date(currentSession.last_active_at as string).getTime();
        const timeSinceLastActive = Date.now() - lastActiveAt;
        const RAPID_IP_CHANGE_MS = 60_000; // 1 minute

        if (timeSinceLastActive < RAPID_IP_CHANGE_MS) {
          // Rapid IP change → create alert & force step-up
          await supabaseAdmin.rpc("create_security_alert", {
            p_user_id: user.id,
            p_alert_type: "rapid_ip_change",
            p_severity: "high",
            p_details: JSON.stringify({
              previous_ip: previousIp,
              new_ip: clientIp,
              time_between_ms: timeSinceLastActive,
              timestamp: new Date().toISOString(),
            }),
          });

          // Clear MFA freshness to force step-up
          await supabaseAdmin.rpc("update_mfa_verified_at_to_null", {
            p_user_id: user.id,
          }).catch(() => {});
        }
      }
    }

    // ── 4. User-Agent anomaly detection ──────────────────────
    if (user_agent && currentSession.user_agent) {
      const storedUA = (currentSession.user_agent as string) || "";
      if (storedUA && storedUA !== user_agent) {
        await supabaseAdmin.rpc("create_security_alert", {
          p_user_id: user.id,
          p_alert_type: "user_agent_change",
          p_severity: "medium",
          p_details: JSON.stringify({
            previous_ua: storedUA.substring(0, 80),
            new_ua: user_agent.substring(0, 80),
            timestamp: new Date().toISOString(),
          }),
        });

        // Clear MFA freshness
        await supabaseAdmin.rpc("update_mfa_verified_at_to_null", {
          p_user_id: user.id,
        }).catch(() => {});
      }
    }

    // ── 5. Update session metadata ───────────────────────────
    await supabaseAdmin
      .from("user_sessions")
      .update({
        last_active_at: new Date().toISOString(),
        ...(user_agent ? { user_agent } : {}),
        ...(clientIp !== "unknown" ? { last_ip: clientIp } : {}),
      })
      .eq("id", currentSession.id);

    // ── 6. Session binding: validate fingerprint ─────────────
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
          // Mismatch → revoke session & create alert
          await supabaseAdmin
            .from("user_sessions")
            .update({
              is_active: false,
              is_current: false,
              revoked_at: new Date().toISOString(),
              revocation_reason: "FINGERPRINT_MISMATCH",
            })
            .eq("id", currentSession.id);

          await supabaseAdmin.rpc("create_security_alert", {
            p_user_id: user.id,
            p_alert_type: "fingerprint_mismatch",
            p_severity: "critical",
            p_details: JSON.stringify({
              session_id: currentSession.id,
              timestamp: new Date().toISOString(),
            }),
          });

          return json({ error: "SESSION_REVOKED", message: "Device fingerprint mismatch" }, 403);
        }
      }
    }

    // ── 7. Step-up enforcement for sensitive actions ──────────
    const sensitiveActions = [
      "payroll_action", "bank_update", "role_change",
      "financial_approval", "salary_change", "permission_update",
    ];

    if (action && sensitiveActions.includes(action)) {
      // Rate limit sensitive actions more aggressively
      const { data: sensitiveAllowed } = await supabaseAdmin.rpc("check_rate_limit", {
        p_key: `sensitive:${user.id}`,
        p_max_requests: 5,
        p_window_ms: 60000,
      });

      if (sensitiveAllowed === false) {
        await supabaseAdmin.rpc("create_security_alert", {
          p_user_id: user.id,
          p_alert_type: "sensitive_rate_limit",
          p_severity: "high",
          p_details: JSON.stringify({
            action,
            timestamp: new Date().toISOString(),
          }),
        });
        return json({ error: "RATE_LIMITED", message: "Too many sensitive requests" }, 429);
      }

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

    return json({
      valid: true,
      user_id: user.id,
      session_version: currentSession.session_version,
    });
  } catch (_e) {
    return json({ error: "INTERNAL_ERROR", message: "Validation failed" }, 500);
  }
});
