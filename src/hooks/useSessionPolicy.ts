import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { recordAuditLog } from "@/lib/auditLog";
import { enrichLoginAttempt } from "@/lib/sessionTracking";
import { acquireRefreshLock, releaseRefreshLock, broadcastSessionRefresh } from "@/lib/refreshLock";

const IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours
const ABSOLUTE_TIMEOUT_MS = 5 * 24 * 60 * 60 * 1000; // 5 days
const CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
const ACTIVITY_DEBOUNCE_MS = 30 * 1000; // Debounce activity updates to 30s
const MAX_VALIDATION_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const MAX_CONSECUTIVE_FAILURES = 5;

// Auth-level errors that should trigger immediate logout
const FATAL_AUTH_PATTERNS = [
  "invalid_token",
  "jwt_expired",
  "refresh_token_invalid",
  "invalid_grant",
  "invalid refresh token",
  "token is expired",
  "JWT expired",
  "session_not_found",
];

function isFatalAuthError(error: any): boolean {
  const msg = (error?.message || error?.error_description || "").toLowerCase();
  const code = error?.code || "";
  const status = error?.status;

  // HTTP 401/403 with auth context = fatal
  if (status === 401 || status === 403) return true;

  return FATAL_AUTH_PATTERNS.some(
    (p) => msg.includes(p.toLowerCase()) || code.includes(p)
  );
}

function isNetworkError(error: any): boolean {
  const msg = (error?.message || "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("err_network") ||
    msg.includes("load failed") ||
    msg.includes("aborted") ||
    msg.includes("timeout") ||
    error?.code === "PGRST301"
  );
}

/**
 * Session lifecycle policy enforcement:
 * - 12h idle timeout (no user-initiated API activity)
 * - 5-day absolute timeout from login
 * - Distinguishes fatal auth errors from transient network issues
 * - Retry transient network failures before logout
 */
export function useSessionPolicy(
  userId: string | undefined,
  signOut: () => Promise<void>
) {
  const lastActivityUpdate = useRef<number>(0);
  const isRevokingRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);

  const forceLogout = useCallback(
    async (
      reason:
        | "IDLE_TIMEOUT"
        | "ABSOLUTE_TIMEOUT"
        | "SESSION_MISSING"
        | "INVALID_SESSION"
    ) => {
      if (isRevokingRef.current) return;
      isRevokingRef.current = true;

      if (import.meta.env.DEV) console.warn(`[SessionPolicy] Force logout triggered: ${reason}`);

      try {
        if (userId) {
          const deviceInfo = await enrichLoginAttempt();

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

          const auditAction =
            reason === "IDLE_TIMEOUT"
              ? "SESSION_IDLE_TIMEOUT"
              : reason === "ABSOLUTE_TIMEOUT"
              ? "SESSION_ABSOLUTE_TIMEOUT"
              : reason === "INVALID_SESSION"
              ? "SESSION_INVALID_TOKEN_LOGOUT"
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
        console.warn(
          "[SessionPolicy] Failed to record session revocation:",
          e
        );
      }

      await signOut();
      isRevokingRef.current = false;
    },
    [userId, signOut]
  );

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
          // Fatal auth error → immediate logout
          if (isFatalAuthError(error)) {
            console.error(
              "[SessionPolicy] Fatal auth error — forcing immediate logout:",
              error.message
            );
            return "FATAL_AUTH_ERROR" as const;
          }

          // Network error → retry
          if (isNetworkError(error) && attempt < MAX_VALIDATION_RETRIES) {
            console.warn(
              `[SessionPolicy] Network error on attempt ${attempt}/${MAX_VALIDATION_RETRIES}, retrying...`,
              error.message
            );
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            continue;
          }

          if (isNetworkError(error)) {
            console.warn(
              `[SessionPolicy] Network errors exhausted after ${MAX_VALIDATION_RETRIES} retries. Skipping cycle.`
            );
            return "NETWORK_FAILURE" as const;
          }

          // Non-network, non-fatal error — treat as missing
          console.warn(
            "[SessionPolicy] Session query error (non-network):",
            error
          );
          return null;
        }

        // Success — reset failure counter
        consecutiveFailuresRef.current = 0;
        return session;
      } catch (e: any) {
        if (attempt < MAX_VALIDATION_RETRIES) {
          console.warn(
            `[SessionPolicy] Exception on attempt ${attempt}/${MAX_VALIDATION_RETRIES}:`,
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

    // Fatal auth error → immediate logout (no retry)
    if (result === "FATAL_AUTH_ERROR") {
      consecutiveFailuresRef.current = 0;
      await forceLogout("INVALID_SESSION");
      return;
    }

    // Network failure — skip cycle, accumulate failures
    if (result === "NETWORK_FAILURE") {
      consecutiveFailuresRef.current++;
      console.warn(
        `[SessionPolicy] Consecutive network failures: ${consecutiveFailuresRef.current}`
      );
      if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
        console.error(
          `[SessionPolicy] ${MAX_CONSECUTIVE_FAILURES} consecutive network failures — forcing logout.`
        );
        await forceLogout("SESSION_MISSING");
      }
      return;
    }

    // No session record
    if (!result) {
      await forceLogout("SESSION_MISSING");
      return;
    }

    // Already revoked server-side
    if (result.revoked_at || !result.is_active) {
      await forceLogout("SESSION_MISSING");
      return;
    }

    const now = Date.now();
    const startedAt = new Date(result.started_at).getTime();
    const lastActiveAt = new Date(result.last_active_at).getTime();

    if (now - startedAt > ABSOLUTE_TIMEOUT_MS) {
      await forceLogout("ABSOLUTE_TIMEOUT");
      return;
    }

    if (now - lastActiveAt > IDLE_TIMEOUT_MS) {
      await forceLogout("IDLE_TIMEOUT");
      return;
    }
  }, [userId, fetchSessionWithRetry, forceLogout]);

  // Periodic validation — delay initial check
  useEffect(() => {
    if (!userId) return;

    const initialDelay = setTimeout(validateSession, 10000);
    const interval = setInterval(validateSession, CHECK_INTERVAL_MS);
    return () => {
      clearTimeout(initialDelay);
      clearInterval(interval);
    };
  }, [userId, validateSession]);

  // Also validate the Supabase auth session itself proactively
  useEffect(() => {
    if (!userId) return;

    const checkAuthSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          if (isFatalAuthError(error)) {
            console.error("[SessionPolicy] Auth session invalid:", error.message);
            await forceLogout("INVALID_SESSION");
          }
          return;
        }

        // Check if token is about to expire (within 60s) and refresh proactively
        if (data.session?.expires_at) {
          const expiresAt = data.session.expires_at * 1000; // convert to ms
          const timeUntilExpiry = expiresAt - Date.now();
          if (timeUntilExpiry > 0 && timeUntilExpiry < 120_000) {
            // Use cross-tab lock to prevent race conditions
            if (!acquireRefreshLock()) {
              console.log("[SessionPolicy] Another tab is refreshing, skipping...");
              return;
            }
            if (import.meta.env.DEV) console.log("[SessionPolicy] Token expiring soon, refreshing proactively...");
            const { error: refreshError } = await supabase.auth.refreshSession();
            releaseRefreshLock();
            if (refreshError) {
              console.warn("[SessionPolicy] Proactive refresh failed:", refreshError.message);
              if (isFatalAuthError(refreshError)) {
                await forceLogout("INVALID_SESSION");
              }
            } else {
              broadcastSessionRefresh();
            }
          }
        }
      } catch (e) {
        console.warn("[SessionPolicy] Auth session check exception:", e);
      }
    };

    // Check auth token health every 30 seconds
    const interval = setInterval(checkAuthSession, 30_000);
    return () => clearInterval(interval);
  }, [userId, forceLogout]);

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
      console.warn("[SessionPolicy] Failed to update last_activity_at:", e);
    }
  }, [userId]);

  return { recordActivity, validateSession };
}
