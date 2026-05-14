import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface PortalContact {
  id: string;
  account_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  whatsapp_number: string | null;
  role: "buyer" | "technician" | "admin" | "finance";
  is_active: boolean;
}

export interface PortalAccount {
  id: string;
  company_name: string;
  status: string;
  primary_contact_name: string | null;
}

interface PortalAuthCtx {
  user: User | null;
  session: Session | null;
  contact: PortalContact | null;
  account: PortalAccount | null;
  loading: boolean;
  /** True when authenticated and resolved as a portal customer */
  isPortalCustomer: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<PortalAuthCtx | undefined>(undefined);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [contact, setContact] = useState<PortalContact | null>(null);
  const [account, setAccount] = useState<PortalAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async (uid: string | null) => {
    if (!uid) {
      setContact(null);
      setAccount(null);
      return;
    }
    const { data: c } = await supabase
      .from("portal_contacts")
      .select("id, account_id, full_name, email, phone, whatsapp_number, role, is_active")
      .eq("auth_user_id", uid)
      .eq("is_active", true)
      .maybeSingle();
    if (!c) {
      setContact(null);
      setAccount(null);
      return;
    }
    setContact(c as PortalContact);
    const { data: a } = await supabase
      .from("portal_accounts")
      .select("id, company_name, status, primary_contact_name")
      .eq("id", c.account_id)
      .maybeSingle();
    setAccount((a as PortalAccount) ?? null);

    // Touch last_login_at (best-effort)
    void supabase
      .from("portal_contacts")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", c.id);
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      // Defer hydrate so we don't deadlock the auth callback
      setTimeout(() => {
        hydrate(sess?.user?.id ?? null).finally(() => setLoading(false));
      }, 0);
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      hydrate(s?.user?.id ?? null).finally(() => setLoading(false));
    });

    return () => sub.subscription.unsubscribe();
  }, [hydrate]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setContact(null);
    setAccount(null);
  }, []);

  const refresh = useCallback(async () => {
    await hydrate(user?.id ?? null);
  }, [hydrate, user?.id]);

  return (
    <Ctx.Provider
      value={{
        user,
        session,
        contact,
        account,
        loading,
        isPortalCustomer: !!user && !!contact && contact.is_active,
        signIn,
        signOut,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePortalAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePortalAuth must be used within PortalAuthProvider");
  return ctx;
}
