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
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);

  const hydrate = useCallback(async (uid: string | null): Promise<{ contact: PortalContact | null; error: Error | null }> => {
    if (!uid) {
      setContact(null);
      setAccount(null);
      setHydratedUserId(null);
      return { contact: null, error: null };
    }
    setHydratedUserId(null);
    const { data: c, error: contactError } = await supabase
      .from("portal_contacts")
      .select("id, account_id, full_name, email, phone, whatsapp_number, role, is_active")
      .eq("auth_user_id", uid)
      .eq("is_active", true)
      .maybeSingle();
    if (contactError) {
      console.error("[PortalAuth] Failed to verify portal contact:", contactError);
      setContact(null);
      setAccount(null);
      setHydratedUserId(uid);
      return { contact: null, error: new Error("Unable to verify portal access. Please try again.") };
    }
    if (!c) {
      setContact(null);
      setAccount(null);
      setHydratedUserId(uid);
      return { contact: null, error: null };
    }
    const portalContact = c as PortalContact;
    setContact(portalContact);
    const { data: a } = await supabase
      .from("portal_accounts")
      .select("id, company_name, status, primary_contact_name")
      .eq("id", c.account_id)
      .maybeSingle();
    setAccount((a as PortalAccount) ?? null);
    setHydratedUserId(uid);

    // Touch last_login_at (best-effort)
    void supabase
      .from("portal_contacts")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", c.id);

    return { contact: portalContact, error: null };
  }, []);

  useEffect(() => {
    let currentHydratedId: string | null = null;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      const nextUserId = sess?.user?.id ?? null;
      setSession(sess);
      setUser(sess?.user ?? null);

      // Skip re-hydration on token refresh / tab focus when the user hasn't changed.
      // This prevents the dashboard from flashing a loading spinner every time the
      // browser tab regains focus and Supabase fires TOKEN_REFRESHED.
      if (nextUserId && nextUserId === currentHydratedId) return;

      if (!nextUserId) {
        currentHydratedId = null;
        setContact(null);
        setAccount(null);
        setHydratedUserId(null);
        return;
      }

      setLoading(true);
      // Defer hydrate so we don't deadlock the auth callback
      setTimeout(() => {
        hydrate(nextUserId).finally(() => {
          currentHydratedId = nextUserId;
          setLoading(false);
        });
      }, 0);
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      const uid = s?.user?.id ?? null;
      hydrate(uid).finally(() => {
        currentHydratedId = uid;
        setLoading(false);
      });
    });

    return () => sub.subscription.unsubscribe();
  }, [hydrate]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) return { error: new Error(error.message) };

    const { contact: portalContact, error: portalError } = await hydrate(data.user?.id ?? null);
    if (portalError) return { error: portalError };
    if (!portalContact) {
      await supabase.auth.signOut();
      return {
        error: new Error(
          "This account isn't set up for the customer portal. Ask your account manager to send you an invite.",
        ),
      };
    }

    return { error: null };
  }, [hydrate]);

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
        loading: loading || (!!user && hydratedUserId !== user.id),
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
