// digilocker-initiate — portal-authenticated endpoint that creates a
// DigiLocker verification session via the KYC provider seam and returns
// the consent URL for the customer to visit.
//
// Gated by feature_flags.digilocker_kyc_enabled. Never trusts client-
// supplied identity — resolves the caller's portal_account server-side.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getKycProvider } from "../_shared/kyc-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const PORTAL_BASE = "https://xboomflow.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Auth
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const callerId = userData?.user?.id;
  if (!callerId) return json({ error: "Unauthorized" }, 401);

  // Feature flag
  const { data: flag } = await admin
    .from("feature_flags")
    .select("enabled")
    .eq("key", "digilocker_kyc_enabled")
    .maybeSingle();
  if (!(flag as any)?.enabled) {
    return json({ error: "DigiLocker verification is not enabled" }, 403);
  }

  // Resolve portal account for caller
  const { data: contact } = await admin
    .from("portal_contacts")
    .select("account_id, full_name, email")
    .eq("auth_user_id", callerId)
    .eq("is_active", true)
    .maybeSingle();
  if (!(contact as any)?.account_id) return json({ error: "No portal account" }, 403);

  const { data: acct } = await admin
    .from("portal_accounts")
    .select("id, company_name, primary_contact_name")
    .eq("id", (contact as any).account_id)
    .maybeSingle();

  try {
    const provider = getKycProvider();
    const redirectUrl = `${PORTAL_BASE}/portal/kyc?dl=return`;
    const session = await provider.createVerificationSession(
      {
        accountId: (contact as any).account_id,
        fullName: (acct as any)?.primary_contact_name || (contact as any).full_name || null,
        email: (contact as any).email || null,
      },
      redirectUrl,
    );

    await admin.from("kyc_audit_log").insert({
      account_id: (contact as any).account_id,
      action: "session_created",
      actor_id: callerId,
      actor_role: "customer",
      metadata: {
        method: "digilocker",
        provider: provider.name,
        session_id: session.sessionId,
      },
    });

    return json({ consent_url: session.consentUrl, session_id: session.sessionId });
  } catch (e) {
    console.error("[digilocker-initiate] failed:", e);
    return json({ error: (e as Error).message }, 502);
  }
});