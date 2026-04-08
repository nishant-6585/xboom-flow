import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { recordSession } from "@/lib/sessionTracking";
import { checkDeviceTrustV2, clearLocalDeviceTrust } from "@/lib/deviceTrust";

type AppRole = "sales" | "supply_chain" | "admin" | "finance" | "it" | "marketing" | "hr" | "sales_manager";

const ROLE_PRIORITY: AppRole[] = ["admin", "hr", "finance", "supply_chain", "sales_manager", "it", "marketing", "sales"];

interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  is_approved: boolean;
  avatar_url: string | null;
}

type MfaStatus = "not_required" | "enrollment_required" | "verification_required" | "verified";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  roles: AppRole[];
  loading: boolean;
  isApproved: boolean;
  mfaStatus: MfaStatus;
  signUp: (email: string, password: string, name: string, team: AppRole) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshMfaStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus>("not_required");
  const lastHydratedUserIdRef = useRef<string | null>(null);
  const isBootstrappedRef = useRef(false);
  const profileRef = useRef<Profile | null>(null);
  const mfaStatusRef = useRef<MfaStatus>("not_required");
  const isFreshLoginRef = useRef(false);

  // Keep mfaStatusRef in sync
  useEffect(() => {
    mfaStatusRef.current = mfaStatus;
  }, [mfaStatus]);

  const fetchUserData = async (userId: string, skipMfaCheck = false) => {
    try {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (profileData) {
        const p = profileData as Profile;
        setProfile(p);
        profileRef.current = p;
      } else {
        setProfile(null);
        profileRef.current = null;
      }

      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (rolesData && rolesData.length > 0) {
        const userRoles = rolesData.map((r) => r.role as AppRole);
        setRoles(userRoles);
        const primaryRole = ROLE_PRIORITY.find((r) => userRoles.includes(r)) || userRoles[0];
        setRole(primaryRole);

        if (!skipMfaCheck) {
          await checkMfaStatus(userRoles, userId);
        }
      } else {
        setRoles([]);
        setRole(null);
        if (!skipMfaCheck) {
          setMfaStatus("not_required");
        }
      }

      lastHydratedUserIdRef.current = userId;
    } catch (error) {
      console.error("[Auth] Error fetching user data:", error);
    }
  };

  const checkMfaStatus = useCallback(async (_userRoles: AppRole[], currentUserId?: string) => {
    try {
      const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      console.log("[Auth] AAL check:", {
        currentLevel: aalData?.currentLevel,
        nextLevel: aalData?.nextLevel,
        error: aalError?.message,
      });

      if (aalError) {
        console.error("[Auth] AAL check error:", aalError);
        setMfaStatus("verification_required");
        return;
      }

      // Already at AAL2 — fully verified
      if (aalData.currentLevel === "aal2") {
        console.log("[Auth] AAL2 confirmed — MFA verified");
        setMfaStatus("verified");
        return;
      }

      // Check if user has TOTP factors enrolled
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        console.error("[Auth] MFA factor list error:", error);
        setMfaStatus("verification_required");
        return;
      }

      const verifiedFactors = data.totp.filter((f) => f.status === "verified");

      if (verifiedFactors.length > 0) {
        // Has enrolled factors but session is AAL1 — check device trust via split fingerprint
        if (currentUserId) {
          // Fast client-side check first
          const trustData = localStorage.getItem("mfa_device_trust");
          if (trustData) {
            try {
              const parsed = JSON.parse(trustData);
              if (parsed.userId === currentUserId && new Date(parsed.expiresAt).getTime() > Date.now()) {
                // Verify server-side with split fingerprints
                const trustResult = await checkDeviceTrustV2(currentUserId);
                if (trustResult === "trusted") {
                  console.log("[Auth] Device trust valid (stable+dynamic match) — skipping MFA");
                  setMfaStatus("verified");
                  return;
                }
                if (trustResult === "step_up") {
                  // Dynamic fingerprint changed (e.g. tz travel) — still trusted but flag for step-up later
                  console.log("[Auth] Device trusted (stable match, dynamic changed) — skipping MFA, step-up may apply");
                  setMfaStatus("verified");
                  return;
                }
              }
              localStorage.removeItem("mfa_device_trust");
            } catch {
              localStorage.removeItem("mfa_device_trust");
            }
          }

          // No local trust — check server directly
          const trustResult = await checkDeviceTrustV2(currentUserId);
          if (trustResult === "trusted" || trustResult === "step_up") {
            console.log("[Auth] Device trusted server-side (result:", trustResult, ") — skipping MFA");
            setMfaStatus("verified");
            return;
          }
        }

        console.log("[Auth] MFA verification required (has factors, no trust)");
        setMfaStatus("verification_required");
        return;
      }

      console.log("[Auth] MFA enrollment required (no factors)");
      setMfaStatus("enrollment_required");
    } catch (e) {
      console.error("[Auth] MFA status check failed:", e);
      setMfaStatus("verification_required");
    }
  }, []);

  const refreshMfaStatus = useCallback(async () => {
    const uid = user?.id;
    await checkMfaStatus(roles, uid);
  }, [roles, checkMfaStatus, user]);

  const refreshProfile = async () => {
    if (user) {
      await fetchUserData(user.id);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST (before getSession)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("[Auth] AUTH_EVENT:", event, {
          userId: session?.user?.id,
          expiresAt: session?.expires_at,
          aal: (session as any)?.aal,
          timestamp: new Date().toISOString(),
        });

        setSession(session);
        setUser(session?.user ?? null);

        const incomingUserId = session?.user?.id ?? null;
        const isSameHydratedUser =
          !!incomingUserId && lastHydratedUserIdRef.current === incomingUserId;

        // TOKEN_REFRESHED: NEVER re-check MFA — preserve AAL2 state
        if (event === "TOKEN_REFRESHED") {
          console.log("[Auth] Token refreshed — preserving MFA state:", mfaStatusRef.current);
          if (incomingUserId && !profileRef.current) {
            // Fire-and-forget: re-fetch profile without blocking or MFA re-check
            setTimeout(() => fetchUserData(incomingUserId, true), 0);
          }
          return;
        }

        // Same-user SIGNED_IN (tab re-focus, storage sync): preserve MFA state
        if (event === "SIGNED_IN" && isSameHydratedUser && !isFreshLoginRef.current) {
          console.log("[Auth] Same-user SIGNED_IN — preserving MFA state:", mfaStatusRef.current);
          if (incomingUserId && !profileRef.current) {
            setTimeout(() => fetchUserData(incomingUserId, true), 0);
          }
          return;
        }

        // INITIAL_SESSION: hydrate user data but check MFA only if not already verified
        if (event === "INITIAL_SESSION") {
          if (incomingUserId) {
            setLoading(true);
            setTimeout(() => {
              // If MFA was already verified (e.g., from a restored session), skip check
              const skipMfa = mfaStatusRef.current === "verified";
              fetchUserData(incomingUserId, skipMfa).finally(() => {
                isBootstrappedRef.current = true;
                setLoading(false);
              });
            }, 0);
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

          // Reset fresh login flag after consuming it
          isFreshLoginRef.current = false;

          setTimeout(() => {
            fetchUserData(incomingUserId).finally(() => {
              isBootstrappedRef.current = true;
              if (shouldBlockUi) setLoading(false);
            });
          }, 0);
        } else {
          setProfile(null);
          setRole(null);
          setRoles([]);
          setMfaStatus("not_required");
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

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("[Auth] Initial getSession:", {
        hasSession: !!session,
        userId: session?.user?.id,
        expiresAt: session?.expires_at,
      });

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
      const { data: rateLimitData, error: rateLimitError } = await supabase
        .rpc("check_login_rate_limit", { p_email: normalizedEmail });

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
    clearLocalDeviceTrust();
    localStorage.removeItem("mfa_device_trust");
    await supabase.auth.signOut();
    setProfile(null);
    profileRef.current = null;
    setRole(null);
    setRoles([]);
    setMfaStatus("not_required");
    lastHydratedUserIdRef.current = null;
    isFreshLoginRef.current = false;
  };

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
        mfaStatus,
        signUp,
        signIn,
        signOut,
        refreshProfile,
        refreshMfaStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
