import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "sales" | "supply_chain" | "admin" | "finance" | "it" | "marketing";

interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  is_approved: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  isApproved: boolean;
  signUp: (email: string, password: string, name: string, team: AppRole) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

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
      }

      // Fetch role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (roleData) {
        setRole(roleData.role as AppRole);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

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

        // Defer Supabase calls with setTimeout to prevent deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRole(null);
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
        fetchUserData(session.user.id).finally(() => {
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Pre-approved admin emails
  const APPROVED_ADMIN_EMAILS = [
    "vishal.saurav@xboom.in",
    "ram@xboom.in",
  ];

  const signUp = async (email: string, password: string, name: string, team: AppRole) => {
    const normalizedEmail = email.toLowerCase().trim();
    
    // Check if there's a pending invitation for this email
    const { data: invitation } = await supabase
      .from("user_invitations")
      .select("*")
      .eq("email", normalizedEmail)
      .eq("status", "pending")
      .maybeSingle();

    // Determine if user should be auto-approved
    const isPreApprovedAdmin = APPROVED_ADMIN_EMAILS.includes(normalizedEmail) && team === "admin";
    const hasInvitation = !!invitation;
    const isAutoApproved = isPreApprovedAdmin || hasInvitation;
    
    // Use the role from invitation if available, otherwise use the selected team
    const assignedRole: AppRole = hasInvitation ? (invitation.role as AppRole) : team;
    
    // Check if trying to register as admin and max reached (only if not invited)
    if (assignedRole === "admin" && !hasInvitation) {
      // Only allow pre-approved emails to register as admin without invitation
      if (!APPROVED_ADMIN_EMAILS.includes(normalizedEmail)) {
        return { error: new Error("Only authorized personnel can register as admin. Please request an invitation from an existing admin.") };
      }
      
      const { data: adminCount } = await supabase.rpc("count_admins");
      if (adminCount && adminCount >= 5) {
        return { error: new Error("Maximum number of admins (5) has been reached.") };
      }
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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        loading,
        isApproved: profile?.is_approved ?? false,
        signUp,
        signIn,
        signOut,
        refreshProfile,
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
