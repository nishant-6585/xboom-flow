import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "sales" | "supply_chain" | "admin" | "finance";

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
    
    // Check if trying to register as admin and max reached
    if (team === "admin") {
      // Only allow pre-approved emails to register as admin
      if (!APPROVED_ADMIN_EMAILS.includes(normalizedEmail)) {
        return { error: new Error("Only authorized personnel can register as admin.") };
      }
      
      const { data: adminCount } = await supabase.rpc("count_admins");
      if (adminCount && adminCount >= 2) {
        return { error: new Error("Maximum number of admins (2) has been reached.") };
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
      // Auto-approve if it's a pre-approved admin email
      const isAutoApproved = APPROVED_ADMIN_EMAILS.includes(normalizedEmail) && team === "admin";
      
      // Create profile
      const { error: profileError } = await supabase.from("profiles").insert({
        user_id: data.user.id,
        name,
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
        role: team,
      });

      if (roleError) {
        console.error("Error creating role:", roleError);
        return { error: roleError };
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
