// digilocker-callback — provider webhook receiver.
//
// 1. Verifies webhook signature via the KYC provider seam. Fails closed:
//    an unsigned or wrong-signature request is rejected with 401 and no
//    side effects.
// 2. Resolves the account from the provider-echoed client_ref (or session
//    lookup), fetches normalized verified data via the seam.
// 3. Persists the sensitive payload (aadhaar_full) via the existing
//    deny-all kyc_sensitive_data table using the service role, inserts a
//    kyc_documents row with method='digilocker', provider=<seam name>.
// 4. Fuzzy-matches the verified name against portal_accounts.primary_contact_name
//    (fallback: latest order.customer_name). Match → auto-approve; mismatch
//    → pending_verification and notify the KYC reviewer role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getKycProvider } from "../_shared/kyc-provider.ts";
import { matchNames, DEFAULT_THRESHOLD } from "../_shared/name-match.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-surepass-signature, x-webhook-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface WebhookPayload {
  session_id?: string;
  client_id?: string;
  client_ref?: string;      // we set this to account_id at initiate time
  status?: string;
  event?: string;
  data?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rawBody = await req.text();
  const provider = getKycProvider();

  // 1. Signature — fail closed
  let ok = false;
  try {
    ok = !!(await provider.verifyWebhook(req, rawBody));
  } catch (_e) {
    ok = false;
  }
  if (!ok) return json({ error: "Invalid signature" }, 401);

  let payload: WebhookPayload;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const sessionId = payload.session_id || payload.client_id || "";
  const clientRef = payload.client_ref || "";
  const eventStatus = String(payload.status || payload.event || "").toLowerCase();

  if (!sessionId) return json({ error: "Missing session id" }, 400);

  // Resolve account_id — prefer client_ref echo, fall back to lookup by session
  let accountId = clientRef;
  if (!accountId) {
    // Best-effort lookup: an earlier session_created audit row will carry it.
    const { data: prior } = await admin
      .from("kyc_audit_log")
      .select("account_id")
      .eq("action", "session_created")
      .contains("metadata", { session_id: sessionId })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    accountId = (prior as any)?.account_id || "";
  }
  if (!accountId) return json({ error: "Account not resolved" }, 404);

  // Log consent-completed intermediate event and stop.
  if (eventStatus.includes("consent") && !eventStatus.includes("verif")) {
    await admin.from("kyc_audit_log").insert({
      account_id: accountId,
      action: "consent_completed",
      actor_role: "system",
      metadata: { method: "digilocker", provider: provider.name, session_id: sessionId },
    });
    return json({ ok: true, stage: "consent_completed" });
  }

  // 2. Fetch verified data via seam
  const verified = await provider.fetchVerifiedData(sessionId);

  // 3. Persist document + sensitive payload
  await admin
    .from("kyc_documents")
    .update({ is_current: false })
    .eq("account_id", accountId)
    .eq("doc_type", "aadhaar")
    .eq("is_current", true);

  const { count: prevCount } = await admin
    .from("kyc_documents")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("doc_type", "aadhaar");

  const { data: doc, error: docErr } = await admin
    .from("kyc_documents")
    .insert({
      account_id: accountId,
      doc_type: "aadhaar",
      file_path: `digilocker://${provider.name}/${sessionId}`,
      file_name: `digilocker-aadhaar-${sessionId}.json`,
      file_size_bytes: rawBody.length,
      mime_type: "application/json",
      status: "approved", // will be flipped to pending on name mismatch below
      method: "digilocker",
      provider: provider.name,
      version: (prevCount ?? 0) + 1,
      metadata: {
        session_id: sessionId,
        verified_name: verified.name,
        verified_dob: verified.dob,
        masked_aadhaar: verified.maskedAadhaar,
      },
    })
    .select("id")
    .single();
  if (docErr) return json({ error: docErr.message }, 500);

  if (verified.aadhaarLast4) {
    // Deny-all table — writable only via service role.
    // Store full digits for compliance retrieval.
    const digits =
      (verified.raw as any)?.data?.aadhaar_number ??
      (verified.raw as any)?.aadhaar_number ??
      null;
    if (digits && /^\d{12}$/.test(String(digits))) {
      await admin.from("kyc_sensitive_data").insert({
        account_id: accountId,
        document_id: doc.id,
        aadhaar_full: String(digits),
      });
    }
  }

  await admin.from("kyc_audit_log").insert({
    account_id: accountId,
    document_id: doc.id,
    action: "verified",
    actor_role: "system",
    metadata: {
      method: "digilocker",
      provider: provider.name,
      session_id: sessionId,
      masked_aadhaar: verified.maskedAadhaar,
    },
  });

  // 4. Name-match guard
  const { data: acct } = await admin
    .from("portal_accounts")
    .select("id, primary_contact_name, company_name")
    .eq("id", accountId)
    .maybeSingle();

  let expectedName = (acct as any)?.primary_contact_name || null;
  if (!expectedName) {
    const { data: contact } = await admin
      .from("portal_contacts")
      .select("email")
      .eq("account_id", accountId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const email = (contact as any)?.email;
    if (email) {
      const { data: order } = await admin
        .from("orders")
        .select("customer_name")
        .ilike("customer_email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      expectedName = (order as any)?.customer_name || null;
    }
  }

  const match = matchNames(verified.name, expectedName);
  const nowIso = new Date().toISOString();

  if (!match.matches) {
    // Fallback to reviewer queue
    await admin
      .from("kyc_documents")
      .update({ status: "pending_verification" })
      .eq("id", doc.id);
    await admin
      .from("portal_accounts")
      .update({
        kyc_status: "pending_verification",
        aadhaar_last4: verified.aadhaarLast4,
        kyc_submitted_at: nowIso,
        kyc_rejection_reason: null,
      })
      .eq("id", accountId);

    await admin.from("kyc_audit_log").insert({
      account_id: accountId,
      document_id: doc.id,
      action: "name_mismatch",
      actor_role: "system",
      notes: `Verified "${verified.name || "?"}" vs expected "${expectedName || "?"}" (score ${match.score.toFixed(2)})`,
      metadata: {
        method: "digilocker",
        provider: provider.name,
        score: match.score,
        threshold: DEFAULT_THRESHOLD,
      },
    });

    // Notify reviewers (admin + sales_manager have review permission)
    await admin.from("notifications").insert([
      {
        target_role: "admin",
        type: "kyc_name_mismatch",
        title: "KYC name mismatch needs review",
        message: `Verified name "${verified.name || "?"}" does not match "${expectedName || "?"}" (score ${(match.score * 100).toFixed(0)}%).`,
      },
      {
        target_role: "sales_manager",
        type: "kyc_name_mismatch",
        title: "KYC name mismatch needs review",
        message: `Verified name "${verified.name || "?"}" does not match "${expectedName || "?"}" (score ${(match.score * 100).toFixed(0)}%).`,
      },
    ]);

    return json({ ok: true, stage: "name_mismatch", score: match.score });
  }

  // Auto-approve
  await admin
    .from("portal_accounts")
    .update({
      kyc_status: "approved",
      aadhaar_last4: verified.aadhaarLast4,
      kyc_submitted_at: nowIso,
      kyc_reviewed_at: nowIso,
      kyc_rejection_reason: null,
    })
    .eq("id", accountId);

  await admin.from("kyc_audit_log").insert({
    account_id: accountId,
    document_id: doc.id,
    action: "auto_approved",
    actor_role: "system",
    metadata: {
      method: "digilocker",
      provider: provider.name,
      score: match.score,
      threshold: DEFAULT_THRESHOLD,
    },
  });

  return json({ ok: true, stage: "auto_approved", score: match.score });
});