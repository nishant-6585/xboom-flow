import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { recordAuditLog } from "@/lib/auditLog";
import { enrichLoginAttempt } from "@/lib/sessionTracking";

const IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours
const ABSOLUTE_TIMEOUT_MS = 5 * 24 * 60 * 60 * 1000; // 5 days
const CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
const ACTIVITY_DEBOUNCE_MS = 30 * 1000; // Debounce activity updates to 30s
const MAX_VALIDATION_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Session lifecycle policy enforcement:
 * - 12h idle timeout (no user-initiated API activity)
 * - 5-day absolute timeout from login
 * - Retry transient network failures before logout (prevents false SESSION_MISSING)
 */
export function useSessionPolicy(userId: string | undefined, signOut: () => Promise<void>) {
  const lastActivityUpdate = useRef<number>(0);
  const isRevokingRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);

  const forceLogout = useCallback(
    async (reason: "IDLE_TIMEOUT" | "ABSOLUTE_TIMEOUT" | "SESSION_MISSING") => {
      if (isRevokingRef.current) return;
      isRevokingRef.current = true;

      console.warn(`[SessionPolicy] Force logout triggered: ${reason}`);

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
        console.warn("[SessionPolicy] Failed to record session revocation:", e);
      }

      await signOut();
      isRevokingRef.current = false;
    },
    [userId, signOut]
  );

  /**
   * Attempt a single session validation query with retry support.
   * Returns the session data or null if truly missing.
   * Throws only on repeated network failures (after retries exhausted).
   */
  const fetchSessionWithRetry = useCallback(async () => {
    if (!userId) return null;

    for (let attempt = 1; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
      try {
        const { data: session, error } = await supabase
          .from("user_sessions")
          .select("id, started_at, last_active_at, revoked_at, is_active")
          .eq("user_id", userId)
          .eq("is_current", true)
          .maybeSingle();

        if (error) {
          // Distinguish between network errors and actual DB/query errors
          const isNetworkError =
            error.message?.includes("Failed to fetch") ||
            error.message?.includes("NetworkError") ||
            error.message?.includes("ERR_NETWORK") ||
            error.message?.includes("Load failed") ||
            error.message?.includes("fetch") ||
            error.code === "PGRST301"; // timeout

          if (isNetworkError && attempt < MAX_VALIDATION_RETRIES) {
            console.warn(
              `[SessionPolicy] Network error on validation attempt ${attempt}/${MAX_VALIDATION_RETRIES}, retrying in ${RETRY_DELAY_MS}ms...`,
              error.message
            );
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            continue;
          }

          // Non-network error or retries exhausted
          if (isNetworkError) {
            console.warn(
              `[SessionPolicy] Network errors exhausted after ${MAX_VALIDATION_RETRIES} retries. Skipping this cycle (NOT logging out).`
            );
            // Return a sentinel to indicate "skip this cycle" rather than force logout
            return "NETWORK_FAILURE" as const;
          }

          // Genuine query error (e.g. permissions) — treat as missing
          console.warn("[SessionPolicy] Session query error (non-network):", error);
          return null;
        }

        // Success — reset failure counter
        consecutiveFailuresRef.current = 0;
        return session;
      } catch (e: any) {
        // Catch-all for fetch/network exceptions
        if (attempt < MAX_VALIDATION_RETRIES) {
          console.warn(
            `[SessionPolicy] Exception on validation attempt ${attempt}/${MAX_VALIDATION_RETRIES}:`,
            e?.message
          );
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        console.warn(
          `[SessionPolicy] Exception after ${MAX_VALIDATION_RETRIES} retries. Skipping cycle.`
        );
        return "NETWORK_FAILURE" as const;
      }
    }

    return "NETWORK_FAILURE" as const;
  }, [userId]);

  const validateSession = useCallback(async () => {
    if (!userId) return;

    const result = await fetchSessionWithRetry();

    // Network failure — skip this validation cycle entirely, do NOT logout
    if (result === "NETWORK_FAILURE") {
      consecutiveFailuresRef.current++;
      console.warn(
        `[SessionPolicy] Consecutive network failures: ${consecutiveFailuresRef.current}`
      );
      // Only force logout after 5 consecutive complete failures (5 minutes of no connectivity)
      if (consecutiveFailuresRef.current >= 5) {
        console.error(
          "[SessionPolicy] 5 consecutive network failures — forcing logout as safety measure."
        );
        await forceLogout("SESSION_MISSING");
      }
      return;
    }

    // No session record → force logout
    if (!result) {
      await forceLogout("SESSION_MISSING");
      return;
    }

    // Already revoked server-side (e.g. admin revoke)
    if (result.revoked_at || !result.is_active) {
      await forceLogout("SESSION_MISSING");
      return;
    }

    const now = Date.now();
    const startedAt = new Date(result.started_at).getTime();
    const lastActiveAt = new Date(result.last_active_at).getTime();

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
  }, [userId, fetchSessionWithRetry, forceLogout]);

  // Periodic session validation — delay initial check to avoid race with login session creation
  useEffect(() => {
    if (!userId) return;

    // Give login flow time to create the session record before first validation
    const initialDelay = setTimeout(validateSession, 10000);

    const interval = setInterval(validateSession, CHECK_INTERVAL_MS);
    return () => {
      clearTimeout(initialDelay);
      clearInterval(interval);
    };
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
      console.warn("[SessionPolicy] Failed to update last_activity_at:", e);
    }
  }, [userId]);

  return { recordActivity, validateSession };
}
