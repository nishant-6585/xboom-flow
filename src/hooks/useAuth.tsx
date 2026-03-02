import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { recordSession } from "@/lib/sessionTracking";

type AppRole = "sales" | "supply_chain" | "admin" | "finance" | "it" | "marketing" | "hr";

// Priority order for determining primary role (highest privilege first)
const ROLE_PRIORITY: AppRole[] = ["admin", "hr", "finance", "supply_chain", "it", "marketing", "sales"];

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

  const fetchUserData = async (userId: string) => {
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData as Profile);
      } else {
        setProfile(null);
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
        // Check MFA status for admin users
        await checkMfaStatus(userRoles);
      } else {
        setRoles([]);
        setRole(null);
        setMfaStatus("not_required");
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  const checkMfaStatus = useCallback(async (userRoles: AppRole[]) => {
    const isAdmin = userRoles.includes("admin");

    try {
      // Always check AAL level first — this is the source of truth
      const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalError) {
        console.error("AAL check error:", aalError);
        // Fail-closed for admins, fail-open for others
        setMfaStatus(isAdmin ? "verification_required" : "not_required");
        return;
      }

      // If already at AAL2, user is fully verified
      if (aalData.currentLevel === "aal2") {
        setMfaStatus("verified");
        return;
      }

      // At AAL1 — check if user has TOTP factors enrolled
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        console.error("MFA factor list error:", error);
        setMfaStatus(isAdmin ? "verification_required" : "not_required");
        return;
      }

      const verifiedFactors = data.totp.filter((f) => f.status === "verified");

      if (verifiedFactors.length > 0) {
        // Has enrolled factors but AAL is not aal2 → needs verification
        setMfaStatus("verification_required");
        return;
      }

      // No factors enrolled
      if (isAdmin) {
        // Admins MUST enroll
        setMfaStatus("enrollment_required");
      } else {
        // Non-admin without factors → no MFA required
        setMfaStatus("not_required");
      }
    } catch (e) {
      console.error("MFA status check failed:", e);
      // Fail-closed for admins
      setMfaStatus(isAdmin ? "verification_required" : "not_required");
    }
  }, []);

  const refreshMfaStatus = useCallback(async () => {
    await checkMfaStatus(roles);
  }, [roles, checkMfaStatus]);

  const refreshProfile = async () => {
    if (user) {
      await fetchUserData(user.id);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Skip re-fetching on token refresh to avoid reload flash when switching tabs
        if (event === "TOKEN_REFRESHED") {
          return;
        }

        // Re-hydrate auth data on meaningful state transitions (SIGNED_IN, INITIAL_SESSION, etc.)
        if (session?.user) {
          setLoading(true);
          setTimeout(() => {
            fetchUserData(session.user.id).finally(() => {
              setLoading(false);
            });
          }, 0);
        } else {
          setProfile(null);
          setRole(null);
          setRoles([]);
          setMfaStatus("not_required");
          setLoading(false);
        }

        if (event === "SIGNED_OUT") {
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setLoading(true);
        fetchUserData(session.user.id).finally(() => {
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
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
      // Use server-side RPC to validate admin registration (checks whitelist + count)
      const { data: validationResult, error: validationError } = await supabase
        .rpc("validate_admin_registration", { p_email: normalizedEmail });
      
      if (validationError) {
        console.error("Admin validation error:", validationError);
        return { error: new Error("Unable to validate admin registration. Please try again.") };
      }
      
      // validationResult is an array, get the first result
      const validation = validationResult?.[0];
      if (!validation?.allowed) {
        return { error: new Error(validation?.reason || "Admin registration not allowed.") };
      }
    }
    
    // Determine if user should be auto-approved (whitelisted admins or invited users)
    let isAutoApproved = hasInvitation;
    if (assignedRole === "admin" && !hasInvitation) {
      // Check if email is in the admin whitelist (server-side)
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
      // Handle "User already registered" - try to sign in and create missing profile
      if (error.message?.includes("User already registered")) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (signInError) {
          return { error: new Error("This email is already registered. Please use the Sign In option instead.") };
        }

        if (signInData.user) {
          // Check if profile exists
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
      // Use name from invitation if available
      const userName = hasInvitation ? invitation.name : name;
      
      // Create profile
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

      // Create user role
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: data.user.id,
        role: assignedRole,
      });

      if (roleError) {
        console.error("Error creating role:", roleError);
        return { error: roleError };
      }

      // Mark invitation as accepted if it exists
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
        // Record the blocked attempt
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
      // If rate limit check fails, allow login attempt (fail-open for availability)
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
    await supabase.auth.signOut();
    setProfile(null);
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
