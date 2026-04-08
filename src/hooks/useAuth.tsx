import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { recordSession } from "@/lib/sessionTracking";

type AppRole = "sales" | "supply_chain" | "admin" | "finance" | "it" | "marketing" | "hr" | "sales_manager";

// Priority order for determining primary role (highest privilege first)
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

  // Keep mfaStatusRef in sync
  useEffect(() => {
    mfaStatusRef.current = mfaStatus;
  }, [mfaStatus]);

  const fetchUserData = async (userId: string, skipMfaCheck = false) => {
    try {
      // Fetch profile
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

      // Fetch all roles (user may have multiple)
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (rolesData && rolesData.length > 0) {
        const userRoles = rolesData.map((r) => r.role as AppRole);
        setRoles(userRoles);
        const primaryRole = ROLE_PRIORITY.find((r) => userRoles.includes(r)) || userRoles[0];
        setRole(primaryRole);
        
        // Only check MFA if not skipped (e.g., during token refresh when already verified)
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

      if (aalData.currentLevel === "aal2") {
        console.log("[Auth] AAL2 confirmed — MFA verified");
        setMfaStatus("verified");
        return;
      }

      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        console.error("[Auth] MFA factor list error:", error);
        setMfaStatus("verification_required");
        return;
      }

      const verifiedFactors = data.totp.filter((f) => f.status === "verified");

      if (verifiedFactors.length > 0) {
        // Check if this device is trusted (24-hour remember)
        const trustData = localStorage.getItem("mfa_device_trust");
        if (trustData) {
          try {
            const parsed = JSON.parse(trustData);
            const trustExpiry = new Date(parsed.expiresAt).getTime();
            if (parsed.userId === currentUserId && trustExpiry > Date.now()) {
              console.log("[Auth] Device trust valid — skipping MFA");
              setMfaStatus("verified");
              return;
            } else {
              localStorage.removeItem("mfa_device_trust");
            }
          } catch {
            localStorage.removeItem("mfa_device_trust");
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
    // Set up auth state listener FIRST
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

        // For TOKEN_REFRESHED: NEVER re-check MFA, preserve AAL2 state
        if (event === "TOKEN_REFRESHED") {
          console.log("[Auth] Token refreshed — preserving MFA state:", mfaStatusRef.current);
          // If profile was lost from state (race condition), silently re-fetch WITHOUT MFA re-check
          if (incomingUserId && !profileRef.current) {
            console.warn("[Auth] Profile missing during TOKEN_REFRESHED — re-fetching silently (skipping MFA)");
            fetchUserData(incomingUserId, true); // skipMfaCheck = true
          }
          return;
        }

        // For same-user SIGNED_IN (e.g., tab re-focus): preserve MFA state
        if (event === "SIGNED_IN" && isSameHydratedUser) {
          console.log("[Auth] Same-user SIGNED_IN — preserving MFA state:", mfaStatusRef.current);
          if (incomingUserId && !profileRef.current) {
            console.warn("[Auth] Profile missing during same-user SIGNED_IN — re-fetching (skipping MFA)");
            fetchUserData(incomingUserId, true); // skipMfaCheck = true
          }
          return;
        }

        if (incomingUserId) {
          // Only block UI during first bootstrap or when user identity actually changes
          const shouldBlockUi = !isBootstrappedRef.current || !isSameHydratedUser;
          if (shouldBlockUi) setLoading(true);

          // Use setTimeout(0) to avoid blocking the auth state change callback
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

    // THEN check for existing session (without forcing duplicate hydration)
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
    
    // Check if there's a pending invitation for this email
    const { data: invitation } = await supabase
      .from("user_invitations")
      .select("*")
      .eq("email", normalizedEmail)
      .eq("status", "pending")
      .maybeSingle();

    const hasInvitation = !!invitation;
    
    // Use the role from invitation if available, otherwise use the selected team
    const assignedRole: AppRole = hasInvitation ? (invitation.role as AppRole) : team;
    
    // Server-side validation for admin registration (only if not invited)
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
      options: {
        emailRedirectTo: redirectUrl,
      },
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
          .update({ 
            status: "accepted", 
            accepted_at: new Date().toISOString() 
          })
          .eq("id", invitation.id);
      }
    }

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const normalizedEmail = email.toLowerCase().trim();

    // Check rate limit before attempting login
    try {
      const { data: rateLimitData, error: rateLimitError } = await supabase
        .rpc("check_login_rate_limit", { p_email: normalizedEmail });

      if (!rateLimitError && rateLimitData?.[0] && !rateLimitData[0].allowed) {
        const retryMinutes = Math.ceil((rateLimitData[0].retry_after_seconds || 60) / 60);
        await supabase.rpc("record_login_attempt", {
          p_email: normalizedEmail,
          p_status: "failure",
          p_failure_reason: "rate_limited",
        });
        return {
          error: new Error(
            `Too many failed login attempts. Please try again in ${retryMinutes} minute${retryMinutes !== 1 ? "s" : ""}.`
          ),
        };
      }
    } catch (e) {
      console.warn("Rate limit check failed, proceeding with login:", e);
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // Record the attempt (fire-and-forget)
    if (error) {
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

      // Record session for fingerprinting
      if (data.user) {
        recordSession(data.user.id).catch(() => {});
      }
    }

    return { error };
  };

  const signOut = async () => {
    // Mark current session as inactive
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
    localStorage.removeItem("mfa_device_trust");
    await supabase.auth.signOut();
    setProfile(null);
    profileRef.current = null;
    setRole(null);
    setRoles([]);
    setMfaStatus("not_required");
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
