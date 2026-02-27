import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { recordAuditLog } from "@/lib/auditLog";
import { enrichLoginAttempt } from "@/lib/sessionTracking";

const IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours
const ABSOLUTE_TIMEOUT_MS = 5 * 24 * 60 * 60 * 1000; // 5 days
const CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
const ACTIVITY_DEBOUNCE_MS = 30 * 1000; // Debounce activity updates to 30s

/**
 * Session lifecycle policy enforcement:
 * - 12h idle timeout (no user-initiated API activity)
 * - 5-day absolute timeout from login
 * - Fail-closed: any validation error → logout
 */
export function useSessionPolicy(userId: string | undefined, signOut: () => Promise<void>) {
  const lastActivityUpdate = useRef<number>(0);
  const isRevokingRef = useRef(false);

  const forceLogout = useCallback(
    async (reason: "IDLE_TIMEOUT" | "ABSOLUTE_TIMEOUT" | "SESSION_MISSING") => {
      if (isRevokingRef.current) return;
      isRevokingRef.current = true;

      try {
        if (userId) {
          const deviceInfo = await enrichLoginAttempt();

          // Revoke the session in DB
          await supabase
            .from("user_sessions")
            .update({
              is_active: false,
              is_current: false,
              revoked_at: new Date().toISOString(),
              revocation_reason: reason,
            })
            .eq("user_id", userId)
            .eq("is_current", true);

          // Audit log
          const auditAction =
            reason === "IDLE_TIMEOUT"
              ? "SESSION_IDLE_TIMEOUT"
              : reason === "ABSOLUTE_TIMEOUT"
              ? "SESSION_ABSOLUTE_TIMEOUT"
              : "SESSION_MISSING_FORCED_LOGOUT";

          await recordAuditLog(userId, "System", {
            action: auditAction,
            details: {
              reason,
              browser: deviceInfo.browser,
              os: deviceInfo.os,
              device: deviceInfo.device,
              timestamp: new Date().toISOString(),
            },
          });
        }
      } catch (e) {
        console.warn("Failed to record session revocation:", e);
      }

      await signOut();
      isRevokingRef.current = false;
    },
    [userId, signOut]
  );

  const validateSession = useCallback(async () => {
    if (!userId) return;

    try {
      const { data: session, error } = await supabase
        .from("user_sessions")
        .select("id, started_at, last_active_at, revoked_at, is_active")
        .eq("user_id", userId)
        .eq("is_current", true)
        .maybeSingle();

      if (error) {
        console.warn("Session validation query failed, failing closed:", error);
        await forceLogout("SESSION_MISSING");
        return;
      }

      // No session record → force logout (fail-closed)
      if (!session) {
        await forceLogout("SESSION_MISSING");
        return;
      }

      // Already revoked server-side (e.g. admin revoke)
      if (session.revoked_at || !session.is_active) {
        await forceLogout("SESSION_MISSING");
        return;
      }

      const now = Date.now();
      const startedAt = new Date(session.started_at).getTime();
      const lastActiveAt = new Date(session.last_active_at).getTime();

      // Absolute timeout: 5 calendar days from login
      if (now - startedAt > ABSOLUTE_TIMEOUT_MS) {
        await forceLogout("ABSOLUTE_TIMEOUT");
        return;
      }

      // Idle timeout: 12 hours since last activity
      if (now - lastActiveAt > IDLE_TIMEOUT_MS) {
        await forceLogout("IDLE_TIMEOUT");
        return;
      }
    } catch (e) {
      console.warn("Session validation failed, failing closed:", e);
      await forceLogout("SESSION_MISSING");
    }
  }, [userId, forceLogout]);

  // Periodic session validation
  useEffect(() => {
    if (!userId) return;

    // Initial validation
    validateSession();

    const interval = setInterval(validateSession, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [userId, validateSession]);

  /**
   * Call this to record a user-initiated activity.
   * Debounced to avoid excessive DB writes.
   * Do NOT call on background token refresh.
   */
  const recordActivity = useCallback(async () => {
    if (!userId) return;

    const now = Date.now();
    if (now - lastActivityUpdate.current < ACTIVITY_DEBOUNCE_MS) return;
    lastActivityUpdate.current = now;

    try {
      await supabase
        .from("user_sessions")
        .update({ last_active_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("is_current", true);
    } catch (e) {
      // Non-critical, don't disrupt user
      console.warn("Failed to update last_activity_at:", e);
    }
  }, [userId]);

  return { recordActivity, validateSession };
}
