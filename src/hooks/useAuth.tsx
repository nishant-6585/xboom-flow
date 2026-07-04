import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { recordSession } from "@/lib/sessionTracking";
import { checkDeviceTrustV2, clearLocalDeviceTrust, DeviceTrustResult } from "@/lib/deviceTrust";

type AppRole = "sales" | "supply_chain" | "admin" | "finance" | "it" | "marketing" | "hr" | "sales_manager";

const ROLE_PRIORITY: AppRole[] = ["admin", "hr", "finance", "supply_chain", "sales_manager", "it", "marketing", "sales"];

// MFA bypass list — specific developer accounts exempt from MFA enforcement.
// Stored as opaque hashes (not plain emails) to avoid leaking staff addresses
// in the public JS bundle. Keep this list minimal.
const hashEmail = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
const MFA_BYPASS_EMAIL_HASHES = new Set<string>([
  "uyvny6",
  "1y4rfqx",
  "1h1z7qi",
]);

const LOGIN_RATE_LIMIT_TIMEOUT_MS = 2500;

const AUTH_TOKEN_KEY_PATTERN = /^sb-.*-auth-token$/;

const getStoredSessionExpiryMs = (value: any): number | null => {
  const rawExpiry = value?.expires_at ?? value?.expiresAt ?? value?.currentSession?.expires_at ?? value?.currentSession?.expiresAt;
  if (typeof rawExpiry !== "number") return null;
  return rawExpiry > 1_000_000_000_000 ? rawExpiry : rawExpiry * 1000;
};

const purgeExpiredAuthSessions = () => {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !AUTH_TOKEN_KEY_PATTERN.test(key)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const expiryMs = getStoredSessionExpiryMs(JSON.parse(raw));
        if (expiryMs !== null && expiryMs <= Date.now()) keysToRemove.push(key);
      } catch {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (e) {
    console.warn("[auth] Expired session cleanup skipped:", e);
  }
};

const isSessionExpired = (session: Session | null | undefined): boolean =>
  !!session?.expires_at && session.expires_at * 1000 <= Date.now();

// One-time cleanup: detect and purge corrupted/malformed Supabase auth tokens
// from localStorage. A malformed refresh_token (e.g. non-JWT short string)
// causes the SDK to enter an infinite failing refresh loop that blocks login.
// Runs once per page load, BEFORE the SDK reads storage.
(() => {
  if (typeof window === "undefined") return;
  try {
    const FLAG = "sb-auth-cleanup-v1";
    if (sessionStorage.getItem(FLAG)) return;
    sessionStorage.setItem(FLAG, "1");

    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      // Supabase v2 stores session under keys like "sb-<ref>-auth-token"
      if (!AUTH_TOKEN_KEY_PATTERN.test(key)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) {
        toRemove.push(key);
        continue;
      }
      // Only purge entries that are TRULY corrupted (unparseable JSON, or a
      // parseable value with no refresh token at all). Do NOT judge validity
      // by token shape or length: Supabase refresh tokens are short opaque
      // strings (often ~12 chars, not JWTs), and an expired access token is
      // still refreshable — deleting either logs the user out of EVERY tab
      // (the storage removal broadcasts SIGNED_OUT), which broke opening
      // email deep links in a new tab.
      try {
        const parsed = JSON.parse(raw);
        const refresh = parsed?.refresh_token ?? parsed?.currentSession?.refresh_token;
        if (typeof refresh !== "string" || refresh.length === 0) {
          toRemove.push(key);
        }
      } catch {
        toRemove.push(key);
      }
    }
    if (toRemove.length) {
      console.warn("[auth] Purging corrupted Supabase token(s) from localStorage:", toRemove);
      toRemove.forEach((k) => localStorage.removeItem(k));
    }
  } catch (e) {
    console.warn("[auth] Token cleanup skipped:", e);
  }
})();

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Login pre-check timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const isMfaBypassed = (email?: string | null): boolean =>
  !!email && MFA_BYPASS_EMAIL_HASHES.has(hashEmail(email.trim().toLowerCase()));

interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  is_approved: boolean;
  avatar_url: string | null;
}

type MfaStatus = "not_required" | "enrollment_required" | "verification_required" | "verified";

// Separated auth state concerns (Phase 9)
interface AuthState {
  mfaStatus: MfaStatus;
  deviceTrust: DeviceTrustResult | null;
  stepUpRequired: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  roles: AppRole[];
  loading: boolean;
  isApproved: boolean;
  mfaStatus: MfaStatus;
  deviceTrust: DeviceTrustResult | null;
  stepUpRequired: boolean;
  signUp: (email: string, password: string, name: string, team: AppRole) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  signOutAllDevices: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshMfaStatus: () => Promise<void>;
  /** Re-check AAL level from server — use before sensitive actions */
  verifyCurrentAAL: () => Promise<"aal1" | "aal2" | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Centralized auth decision logic (Phase 10) ──────────────

interface EvaluateAuthInput {
  currentAal: string | null;
  trustResult: DeviceTrustResult | null;
  hasVerifiedFactors: boolean;
  hasAnyFactors: boolean;
}

interface EvaluateAuthOutput {
  mfaStatus: MfaStatus;
  deviceTrust: DeviceTrustResult | null;
  stepUpRequired: boolean;
}

function evaluateAuthState(input: EvaluateAuthInput): EvaluateAuthOutput {
  const { currentAal, trustResult, hasVerifiedFactors, hasAnyFactors } = input;

  // Already at AAL2 — fully verified at protocol level
  if (currentAal === "aal2") {
    return {
      mfaStatus: "verified",
      deviceTrust: trustResult ?? "trusted",
      stepUpRequired: false,
    };
  }

  // Has enrolled TOTP factors — check device trust
  if (hasVerifiedFactors) {
    if (trustResult === "trusted") {
      return { mfaStatus: "verified", deviceTrust: "trusted", stepUpRequired: false };
    }
    if (trustResult === "step_up") {
      // Dynamic fingerprint changed — trust the device but flag for step-up on sensitive actions
      return { mfaStatus: "verified", deviceTrust: "step_up", stepUpRequired: true };
    }
    // Untrusted or null — require full MFA
    return { mfaStatus: "verification_required", deviceTrust: "untrusted", stepUpRequired: false };
  }

  // No factors enrolled at all
  if (!hasAnyFactors) {
    return { mfaStatus: "enrollment_required", deviceTrust: null, stepUpRequired: false };
  }

  // Has factors but none verified (edge case)
  return { mfaStatus: "enrollment_required", deviceTrust: null, stepUpRequired: false };
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState<AuthState>({
    mfaStatus: "not_required",
    deviceTrust: null,
    stepUpRequired: false,
  });

  const lastHydratedUserIdRef = useRef<string | null>(null);
  const isBootstrappedRef = useRef(false);
  const profileRef = useRef<Profile | null>(null);
  const mfaStatusRef = useRef<MfaStatus>("not_required");
  const isFreshLoginRef = useRef(false);
  // Phase 4: race condition guard
  const requestIdRef = useRef(0);
  // Deduplicate fetchUserData — prevent parallel calls
  const isFetchingRef = useRef(false);
  const fetchPromiseRef = useRef<Promise<void> | null>(null);

  // Keep mfaStatusRef in sync
  useEffect(() => {
    mfaStatusRef.current = authState.mfaStatus;
  }, [authState.mfaStatus]);

  const fetchUserData = async (userId: string, skipMfaCheck = false) => {
    // Deduplicate: share the in-flight request instead of returning early.
    // Returning early can briefly expose profile=null and send approved users to Pending Approval.
    if (isFetchingRef.current && fetchPromiseRef.current) {
      console.log("[Auth] fetchUserData already in progress, awaiting existing call");
      return fetchPromiseRef.current;
    }
    isFetchingRef.current = true;

    // Phase 4: race condition guard
    const requestId = ++requestIdRef.current;

    const fetchPromise = (async () => {
      try {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        if (profileError) throw profileError;

        // Stale request — bail out
        if (requestId !== requestIdRef.current) return;

        if (profileData) {
          const p = profileData as Profile;
          setProfile(p);
          profileRef.current = p;
        } else {
          setProfile(null);
          profileRef.current = null;
        }

        const { data: rolesData, error: rolesError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);

        if (rolesError) throw rolesError;

        // Stale request — bail out
        if (requestId !== requestIdRef.current) return;

        if (rolesData && rolesData.length > 0) {
          const userRoles = rolesData.map((r) => r.role as AppRole);
          setRoles(userRoles);
          const primaryRole = ROLE_PRIORITY.find((r) => userRoles.includes(r)) || userRoles[0];
          setRole(primaryRole);

          if (!skipMfaCheck) {
            await checkMfaStatus(userId);
          }
        } else {
          setRoles([]);
          setRole(null);
          if (!skipMfaCheck) {
            setAuthState({ mfaStatus: "not_required", deviceTrust: null, stepUpRequired: false });
          }
        }

        lastHydratedUserIdRef.current = userId;
      } catch (error) {
        // Only apply state if still the latest request
        if (requestId === requestIdRef.current) {
          console.error("[Auth] Error fetching user data:", error);
        }
      } finally {
        if (fetchPromiseRef.current === fetchPromise) {
          fetchPromiseRef.current = null;
          isFetchingRef.current = false;
        }
      }
    })();

    fetchPromiseRef.current = fetchPromise;
    return fetchPromise;
  };

  // Phase 1, 6, 10: Hardened MFA check — server-only trust, AAL-based validation
  const checkMfaStatus = useCallback(async (currentUserId: string) => {
    try {
      // MFA bypass for whitelisted developer accounts
      const { data: userResp } = await supabase.auth.getUser();
      if (isMfaBypassed(userResp?.user?.email)) {
        if (import.meta.env.DEV) console.log("[Auth] MFA bypassed for whitelisted email:", userResp?.user?.email);
        sessionStorage.removeItem("step_up_required");
        setAuthState({ mfaStatus: "verified", deviceTrust: "trusted", stepUpRequired: false });
        return;
      }

      // Phase 6: Always validate with AAL from Supabase
      const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (import.meta.env.DEV) {
        console.log("[Auth] AAL check:", {
          currentLevel: aalData?.currentLevel,
          nextLevel: aalData?.nextLevel,
          error: aalError?.message,
        });
      }

      if (aalError) {
        console.error("[Auth] AAL check error:", aalError);
        setAuthState({ mfaStatus: "verification_required", deviceTrust: null, stepUpRequired: false });
        return;
      }

      // List factors
      const { data: factorData, error: factorError } = await supabase.auth.mfa.listFactors();
      if (factorError) {
        console.error("[Auth] MFA factor list error:", factorError);
        setAuthState({ mfaStatus: "verification_required", deviceTrust: null, stepUpRequired: false });
        return;
      }

      const verifiedFactors = factorData.totp.filter((f) => f.status === "verified");
      const hasVerifiedFactors = verifiedFactors.length > 0;
      const hasAnyFactors = factorData.totp.length > 0;

      // Phase 1: ALWAYS call server for trust — NO localStorage as decision source
      let trustResult: DeviceTrustResult | null = null;
      if (hasVerifiedFactors && aalData.currentLevel !== "aal2") {
        trustResult = await checkDeviceTrustV2(currentUserId);
        console.log("[Auth] Server device trust result:", trustResult);
      }

      // Phase 10: Centralized decision
      const result = evaluateAuthState({
        currentAal: aalData.currentLevel,
        trustResult,
        hasVerifiedFactors,
        hasAnyFactors,
      });

      if (import.meta.env.DEV) {
        console.log("[Auth] Auth state decision:", result);
      }

      // Phase 2: Persist step-up signal in sessionStorage (survives page refresh, not spoofable for security decisions)
      if (result.stepUpRequired) {
        sessionStorage.setItem("step_up_required", "true");
      } else {
        sessionStorage.removeItem("step_up_required");
      }

      setAuthState(result);
    } catch (e) {
      console.error("[Auth] MFA status check failed:", e);
      setAuthState({ mfaStatus: "verification_required", deviceTrust: null, stepUpRequired: false });
    }
  }, []);

  const refreshMfaStatus = useCallback(async () => {
    const uid = user?.id;
    if (uid) {
      await checkMfaStatus(uid);
    }
  }, [checkMfaStatus, user]);

  const refreshProfile = async () => {
    if (user) {
      await fetchUserData(user.id);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
      if (import.meta.env.DEV) {
        console.log("[Auth] AUTH_EVENT:", event, {
          userId: session?.user?.id,
          expiresAt: session?.expires_at,
          aal: (session as any)?.aal,
          timestamp: new Date().toISOString(),
        });
      }

        // Phase 7: Check session expiry before applying
        if (isSessionExpired(session)) {
          console.warn("[Auth] Received expired session, clearing stale local auth state:", { expiresAt: session?.expires_at });
          purgeExpiredAuthSessions();
          setSession(null);
          setUser(null);
          setProfile(null);
          profileRef.current = null;
          setRole(null);
          setRoles([]);
          setAuthState({ mfaStatus: "not_required", deviceTrust: null, stepUpRequired: false });
          lastHydratedUserIdRef.current = null;
          isFreshLoginRef.current = false;
          isBootstrappedRef.current = true;
          setLoading(false);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);

        const incomingUserId = session?.user?.id ?? null;
        const isSameHydratedUser =
          !!incomingUserId && lastHydratedUserIdRef.current === incomingUserId;

        // TOKEN_REFRESHED: NEVER re-check MFA — preserve AAL2 state
        if (event === "TOKEN_REFRESHED") {
          console.log("[Auth] Token refreshed — preserving MFA state:", mfaStatusRef.current);
          if (incomingUserId && !profileRef.current) {
            // Phase 5: proper async instead of setTimeout(0)
            fetchUserData(incomingUserId, true);
          }
          return;
        }

        // Same-user SIGNED_IN (tab re-focus, storage sync): preserve MFA state
        if (event === "SIGNED_IN" && isSameHydratedUser && !isFreshLoginRef.current) {
          console.log("[Auth] Same-user SIGNED_IN — preserving MFA state:", mfaStatusRef.current);
          if (incomingUserId && !profileRef.current) {
            fetchUserData(incomingUserId, true);
          }
          return;
        }

        // INITIAL_SESSION: hydrate user data
        if (event === "INITIAL_SESSION") {
          if (incomingUserId) {
            setLoading(true);
            const skipMfa = mfaStatusRef.current === "verified";
            fetchUserData(incomingUserId, skipMfa).finally(() => {
              isBootstrappedRef.current = true;
              setLoading(false);
            });
          } else {
            isBootstrappedRef.current = true;
            setLoading(false);
          }
          return;
        }

        // Fresh login (new user or isFreshLogin flag)
        if (incomingUserId) {
          const shouldBlockUi = !isBootstrappedRef.current || !isSameHydratedUser;
          if (shouldBlockUi) setLoading(true);

          isFreshLoginRef.current = false;

          fetchUserData(incomingUserId).finally(() => {
            isBootstrappedRef.current = true;
            if (shouldBlockUi) setLoading(false);
          });
        } else {
          setProfile(null);
          setRole(null);
          setRoles([]);
          setAuthState({ mfaStatus: "not_required", deviceTrust: null, stepUpRequired: false });
          lastHydratedUserIdRef.current = null;
          isBootstrappedRef.current = true;
          setLoading(false);
        }

        if (event === "SIGNED_OUT") {
          console.log("[Auth] SIGNED_OUT — clearing all state");
          setLoading(false);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (import.meta.env.DEV) {
        console.log("[Auth] Initial getSession:", {
          hasSession: !!session,
          userId: session?.user?.id,
          expiresAt: session?.expires_at,
        });
      }

      if (isSessionExpired(session)) {
        console.warn("[Auth] Initial session expired, clearing stale local auth state:", { expiresAt: session?.expires_at });
        purgeExpiredAuthSessions();
        setSession(null);
        setUser(null);
        isBootstrappedRef.current = true;
        setLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);

      const incomingUserId = session?.user?.id ?? null;
      if (!incomingUserId) {
        isBootstrappedRef.current = true;
        setLoading(false);
        return;
      }

      if (lastHydratedUserIdRef.current === incomingUserId) {
        isBootstrappedRef.current = true;
        setLoading(false);
        return;
      }

      setLoading(true);
      fetchUserData(incomingUserId).finally(() => {
        isBootstrappedRef.current = true;
        setLoading(false);
      });
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signUp = async (email: string, password: string, name: string, team: AppRole) => {
    const normalizedEmail = email.toLowerCase().trim();

    const { data: invitation } = await supabase
      .from("user_invitations")
      .select("*")
      .eq("email", normalizedEmail)
      .eq("status", "pending")
      .maybeSingle();

    const hasInvitation = !!invitation;
    const assignedRole: AppRole = hasInvitation ? (invitation.role as AppRole) : team;

    if (assignedRole === "admin" && !hasInvitation) {
      const { data: validationResult, error: validationError } = await supabase
        .rpc("validate_admin_registration", { p_email: normalizedEmail });

      if (validationError) {
        console.error("Admin validation error:", validationError);
        return { error: new Error("Unable to validate admin registration. Please try again.") };
      }

      const validation = validationResult?.[0];
      if (!validation?.allowed) {
        return { error: new Error(validation?.reason || "Admin registration not allowed.") };
      }
    }

    let isAutoApproved = hasInvitation;
    if (assignedRole === "admin" && !hasInvitation) {
      const { data: isWhitelisted } = await supabase.rpc("can_register_as_admin", { p_email: normalizedEmail });
      isAutoApproved = isWhitelisted === true;
    }

    const redirectUrl = `${window.location.origin}/`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl },
    });

    if (error) {
      if (error.message?.includes("User already registered")) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          return { error: new Error("This email is already registered. Please use the Sign In option instead.") };
        }

        if (signInData.user) {
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("user_id", signInData.user.id)
            .maybeSingle();

          if (!existingProfile) {
            const userName = hasInvitation ? invitation.name : name;

            await supabase.from("profiles").insert({
              user_id: signInData.user.id,
              name: userName,
              email: normalizedEmail,
              is_approved: isAutoApproved,
            });

            await supabase.from("user_roles").insert({
              user_id: signInData.user.id,
              role: assignedRole,
            });

            if (hasInvitation) {
              await supabase
                .from("user_invitations")
                .update({ status: "accepted", accepted_at: new Date().toISOString() })
                .eq("id", invitation.id);
            }
          }
        }

        return { error: null };
      }

      return { error };
    }

    if (data.user) {
      const userName = hasInvitation ? invitation.name : name;

      const { error: profileError } = await supabase.from("profiles").insert({
        user_id: data.user.id,
        name: userName,
        email: normalizedEmail,
        is_approved: isAutoApproved,
      });

      if (profileError) {
        console.error("Error creating profile:", profileError);
        return { error: profileError };
      }

      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: data.user.id,
        role: assignedRole,
      });

      if (roleError) {
        console.error("Error creating role:", roleError);
        return { error: roleError };
      }

      if (hasInvitation) {
        await supabase
          .from("user_invitations")
          .update({ status: "accepted", accepted_at: new Date().toISOString() })
          .eq("id", invitation.id);
      }
    }

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const normalizedEmail = email.toLowerCase().trim();

    try {
      const { data: rateLimitData, error: rateLimitError } = await withTimeout(
        Promise.resolve(supabase.rpc("check_login_rate_limit", { p_email: normalizedEmail })),
        LOGIN_RATE_LIMIT_TIMEOUT_MS
      );

      if (!rateLimitError && rateLimitData?.[0] && !rateLimitData[0].allowed) {
        const retryMinutes = Math.ceil((rateLimitData[0].retry_after_seconds || 60) / 60);
        Promise.resolve(supabase.rpc("record_login_attempt", {
          p_email: normalizedEmail,
          p_status: "failure",
          p_failure_reason: "rate_limited",
        })).catch(() => {});
        return {
          error: new Error(
            `Too many failed login attempts. Please try again in ${retryMinutes} minute${retryMinutes !== 1 ? "s" : ""}.`
          ),
        };
      }
    } catch (e) {
      console.warn("Rate limit check failed, proceeding with login:", e);
    }

    // Mark as fresh login so onAuthStateChange knows to run full MFA check
    isFreshLoginRef.current = true;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      isFreshLoginRef.current = false;
      Promise.resolve(supabase.rpc("record_login_attempt", {
        p_email: normalizedEmail,
        p_status: "failure",
        p_failure_reason: error.message,
      })).catch(() => {});
    } else {
      Promise.resolve(supabase.rpc("record_login_attempt", {
        p_email: normalizedEmail,
        p_status: "success",
        p_user_id: data.user?.id ?? null,
      })).catch(() => {});

      if (data.user) {
        recordSession(data.user.id).catch(() => {});
      }
    }

    return { error };
  };

  // Phase 8: Complete cleanup on sign out
  const signOut = async () => {
    if (user) {
      await supabase
        .from("user_sessions")
        .update({
          is_active: false,
          is_current: false,
          revoked_at: new Date().toISOString(),
          revocation_reason: "SIGNED_OUT",
        })
        .eq("user_id", user.id)
        .eq("is_current", true);
    }

    // Clear all trust-related storage
    clearLocalDeviceTrust();
    localStorage.removeItem("mfa_device_trust");
    localStorage.removeItem("xboom_refresh_lock");
    localStorage.removeItem("xboom_session_sync");
    sessionStorage.removeItem("step_up_required");
    sessionStorage.removeItem("last_mfa_verified_at");
    sessionStorage.removeItem("xboom_session_row_id");
    sessionStorage.clear();

    await supabase.auth.signOut();
    setProfile(null);
    profileRef.current = null;
    setRole(null);
    setRoles([]);
    setAuthState({ mfaStatus: "not_required", deviceTrust: null, stepUpRequired: false });
    lastHydratedUserIdRef.current = null;
    isFreshLoginRef.current = false;
    isFetchingRef.current = false;
    requestIdRef.current = 0;
  };

  // Global logout — revoke all sessions, devices, and increment session version
  const signOutAllDevices = async () => {
    if (user) {
      // Increment session version to invalidate all stale sessions
      try { await supabase.rpc("increment_session_version", { p_user_id: user.id }); } catch {}

      // Revoke all sessions
      await supabase
        .from("user_sessions")
        .update({
          is_active: false,
          is_current: false,
          revoked_at: new Date().toISOString(),
          revocation_reason: "GLOBAL_LOGOUT",
        })
        .eq("user_id", user.id);

      // Revoke all trusted devices
      await supabase
        .from("trusted_devices")
        .update({ is_revoked: true } as any)
        .eq("user_id", user.id)
        .eq("is_revoked", false);

      // Create security alert
      try {
        await supabase.rpc("create_security_alert", {
          p_user_id: user.id,
          p_alert_type: "global_logout",
          p_severity: "medium",
          p_details: JSON.stringify({ timestamp: new Date().toISOString() }),
        });
      } catch {}
    }

    // Reuse signOut for local cleanup
    await signOut();
  };

  // Re-check AAL from server — never rely on cached state for sensitive actions
  const verifyCurrentAAL = useCallback(async (): Promise<"aal1" | "aal2" | null> => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) return null;
      return (data.currentLevel as "aal1" | "aal2") ?? null;
    } catch {
      return null;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        roles,
        loading,
        isApproved: profile?.is_approved ?? false,
        mfaStatus: authState.mfaStatus,
        deviceTrust: authState.deviceTrust,
        stepUpRequired: authState.stepUpRequired,
        signUp,
        signIn,
        signOut,
        signOutAllDevices,
        refreshProfile,
        refreshMfaStatus,
        verifyCurrentAAL,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // During HMR / hot-reload the module context can diverge; return a
    // safe default instead of crashing the entire tree.
    if (import.meta.env.DEV) {
      console.warn("[useAuth] context undefined – returning safe defaults (HMR?)");
    }
    return {
      user: null,
      profile: null,
      roles: [] as string[],
      loading: true,
      mfaStatus: "not_required" as const,
      isApproved: false,
      signIn: async () => ({ error: new Error("AuthProvider not mounted") as any }),
      signUp: async () => ({ error: new Error("AuthProvider not mounted") as any }),
      signOut: async () => {},
      signOutAllDevices: async () => {},
      refreshProfile: async () => {},
    } as ReturnType<typeof useAuth>;
  }
  return context;
};
