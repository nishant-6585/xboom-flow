// digilocker-callback — dual-path DigiLocker receiver.
//
// * Direct DigiLocker (OAuth 2.0 + PKCE): GET redirect from MeriPehchaan
//   with `?code=...&state=...`. Validate state against kyc_digilocker_sessions,
//   exchange the code server-side, fetch a Driving Licence or PAN record,
//   then run the SAME downstream (persist doc + sensitive row + name-match
//   guard + auto-approve or reviewer queue). Ends in a 302 back to the
//   portal KYC page with a status query param the UI renders.
//
// * Legacy webhook providers (Surepass etc.): POST with HMAC signature.
//   Preserved unchanged.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  getKycProvider,
  isOAuthKycProvider,
  DocumentTypeDeniedError,
} from "../_shared/kyc-provider.ts";
import type { KycVerifiedData } from "../_shared/kyc-provider.ts";
import { matchBestName, DEFAULT_THRESHOLD } from "../_shared/name-match.ts";
import {
  revokeAccessToken,
  type DigiLockerExchangeResult,
} from "../_shared/kyc-providers/digilocker-direct.ts";

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

const PORTAL_KYC_URL = "https://xboomflow.com/portal/kyc";

function redirectToPortal(status: string, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ dl: status, ...extra });
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: `${PORTAL_KYC_URL}?${p.toString()}` },
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

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const provider = getKycProvider();

  // ── DIRECT (OAuth) PATH ────────────────────────────────────────────────
  if (req.method === "GET" && isOAuthKycProvider(provider)) {
    const url = new URL(req.url);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const errParam = url.searchParams.get("error");
    if (errParam) {
      return redirectToPortal("failure", { reason: errParam.slice(0, 80) });
    }
    if (!code || !state) return redirectToPortal("failure", { reason: "missing_code_or_state" });

    // Look up + validate the state token
    const { data: sess } = await admin
      .from("kyc_digilocker_sessions")
      .select("id, session_id, account_id, contact_id, code_verifier, redirect_uri, expires_at, consumed_at")
      .eq("state", state)
      .maybeSingle();
    if (!sess) return redirectToPortal("failure", { reason: "invalid_state" });
    if ((sess as any).consumed_at) return redirectToPortal("failure", { reason: "state_already_used" });
    if (new Date((sess as any).expires_at).getTime() < Date.now()) {
      return redirectToPortal("failure", { reason: "state_expired" });
    }

    const accountId = (sess as any).account_id as string;

    // Single-use: mark consumed immediately.
    await admin
      .from("kyc_digilocker_sessions")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", (sess as any).id);

    let verified: DigiLockerExchangeResult;
    try {
      verified = (await provider.exchangeCodeAndFetch(
        code,
        (sess as any).code_verifier,
        (sess as any).redirect_uri,
      )) as DigiLockerExchangeResult;
    } catch (e) {
      const isDenied = e instanceof DocumentTypeDeniedError;
      const reason = isDenied
        ? ((e as Error).message || "document_type_denied")
        : "exchange_failed";
      const action =
        reason === "hmac_mismatch" ? "hmac_mismatch"
        : reason === "no_supported_document" ? "no_supported_document"
        : isDenied ? "document_type_denied"
        : "exchange_failed";
      await admin.from("kyc_audit_log").insert({
        account_id: accountId,
        action,
        actor_role: "system",
        notes: (e as Error).message?.slice(0, 500) ?? null,
        metadata: { method: "digilocker", provider: provider.name, session_id: (sess as any).session_id },
      });
      return redirectToPortal(isDenied ? "denied" : "failure", {
        reason,
      });
    }

    const docType = verified.documentType || "unknown";
    const nowIso = new Date().toISOString();

    // ── Upload the certificate PDF into the reviewer-visible bucket so it
    //    appears in the KYC review UI at parity with manual uploads. ──
    let filePath = `digilocker://${provider.name}/${(sess as any).session_id}`;
    let fileName = verified.pdfFilename || `digilocker-${docType}-${(sess as any).session_id}.pdf`;
    let fileSize = 0;
    let mimeType = "application/pdf";
    if (verified.pdf && verified.pdf.byteLength > 0) {
      const safe = fileName.replace(/[^\w.\-]+/g, "_");
      const storagePath = `${accountId}/${docType}/${Date.now()}-${safe}`;
      const { error: upErr } = await admin.storage
        .from("kyc-documents")
        .upload(storagePath, verified.pdf, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (!upErr) {
        filePath = storagePath;
        fileSize = verified.pdf.byteLength;
      } else {
        console.warn("[digilocker-callback] pdf upload failed:", upErr.message);
        // Fall back to XML metadata; still record the document row.
        mimeType = "application/xml";
        fileName = fileName.replace(/\.pdf$/i, ".xml");
      }
    } else {
      mimeType = "application/xml";
      fileName = fileName.replace(/\.pdf$/i, ".xml");
    }

    // Supersede prior "current" for this doc type
    await admin
      .from("kyc_documents")
      .update({ is_current: false })
      .eq("account_id", accountId)
      .eq("doc_type", docType)
      .eq("is_current", true);

    const { count: prevCount } = await admin
      .from("kyc_documents")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("doc_type", docType);

    const docMetadata: Record<string, unknown> = {
      session_id: (sess as any).session_id,
      verified_name: verified.name,
      holder_name: verified.name, // what the review UI surfaces
      token_identity_name: verified.tokenIdentity?.name ?? null,
      verified_dob: verified.dob,
      document_type: docType,
      masked_document_number: verified.maskedDocumentNumber,
      doctype_code: verified.doctypeCode,
      uri: verified.uri,
    };
    const { data: doc, error: docErr } = await admin
      .from("kyc_documents")
      .insert({
        account_id: accountId,
        doc_type: docType,
        file_path: filePath,
        file_name: fileName,
        file_size_bytes: fileSize,
        mime_type: mimeType,
        status: "approved", // may be flipped to pending on name mismatch below
        method: "digilocker",
        provider: provider.name,
        version: (prevCount ?? 0) + 1,
        metadata: docMetadata,
      })
      .select("id")
      .single();
    if (docErr) {
      return redirectToPortal("failure", { reason: "persist_failed" });
    }

    // Deny-all sensitive storage — full doc number + token-response identity.
    const tokenId = verified.tokenIdentity;
    if (
      verified.documentNumberFull ||
      tokenId?.digilockerid ||
      tokenId?.dob ||
      tokenId?.gender ||
      tokenId?.consentValidTill
    ) {
      await admin.from("kyc_sensitive_data").insert({
        account_id: accountId,
        document_id: doc.id,
        document_type: docType,
        document_number_full: verified.documentNumberFull || null,
        digilockerid: tokenId?.digilockerid || null,
        dob: tokenId?.dob || null,
        gender: tokenId?.gender || null,
        consent_valid_till: tokenId?.consentValidTill || null,
      });
    }

    // Best-effort revoke; never persist refresh_token (adapter strips it).
    if (verified.accessToken) {
      // Fire-and-forget; log-only.
      revokeAccessToken(verified.accessToken).catch(() => {});
    }

    await admin.from("kyc_audit_log").insert({
      account_id: accountId,
      document_id: doc.id,
      action: "verified",
      actor_role: "system",
      metadata: {
        method: "digilocker",
        provider: provider.name,
        session_id: (sess as any).session_id,
        document_type: docType,
        masked_document_number: verified.maskedDocumentNumber,
      },
    });

    // Name-match guard. Match the DigiLocker holder name against ALL of the
    // customer's known names — the linked contact's full_name (what the
    // Customers list shows), the account's primary_contact_name, and the latest
    // order's customer_name — and approve on the best match. Prevents false
    // mismatches when primary_contact_name is blank/stale on a reused account.
    const { data: acct } = await admin
      .from("portal_accounts")
      .select("id, primary_contact_name, company_name")
      .eq("id", accountId)
      .maybeSingle();
    const { data: contact } = await admin
      .from("portal_contacts")
      .select("email, full_name")
      .eq("account_id", accountId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    let orderName: string | null = null;
    const contactEmail = (contact as any)?.email;
    if (contactEmail) {
      const { data: order } = await admin
        .from("orders")
        .select("customer_name")
        .ilike("customer_email", contactEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      orderName = (order as any)?.customer_name || null;
    }
    const candidates = [
      (contact as any)?.full_name,
      (acct as any)?.primary_contact_name,
      orderName,
    ];
    let match = matchBestName(verified.name, candidates);
    // Safety net: the token response carries the holder's DigiLocker
    // account name (Aadhaar-sourced). If the certificate XML parse produced
    // something that doesn't match (e.g. a certificate title), the account
    // name is still the same human — score it too and keep the best.
    const tokenName = verified.tokenIdentity?.name || null;
    if (!match.matches && tokenName && tokenName !== verified.name) {
      const alt = matchBestName(tokenName, candidates);
      if (alt.score > match.score) match = alt;
    }
    // Best-matching (or first non-empty) name — for audit/notify messages.
    const expectedName = match.matchedCandidate ||
      candidates.find((c) => (c || "").trim()) || null;

    // AI second opinion: before parking a government-verified document in
    // the reviewer queue over a name mismatch, let the in-house AI reviewer
    // read the signed certificate PDF itself. If IT extracts a holder name
    // that matches the customer (plus type/number agree), ai-kyc-review
    // auto-approves the doc + account and we return success directly.
    let aiFallback: { decision?: string; recommendation?: string; name_match_score?: number } | null = null;
    if (!match.matches && fileSize > 0 && mimeType === "application/pdf") {
      try {
        const aiRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-kyc-review`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({
            document_id: doc.id,
            account_id: accountId,
            digilocker_fallback: true,
          }),
        });
        aiFallback = await aiRes.json().catch(() => null);
        if (aiRes.ok && aiFallback?.decision === "auto_approved") {
          // Stamp both verdicts on the document so the queue's
          // "Approved / Reviewed by" cell can show the DigiLocker failure
          // and the AI save (guard score in the tooltip).
          await admin.from("kyc_documents")
            .update({
              metadata: {
                ...docMetadata,
                name_match_guard: {
                  score: Number(match.score.toFixed(3)),
                  threshold: DEFAULT_THRESHOLD,
                  expected_name: expectedName,
                  matched_candidate: match.matchedCandidate,
                  checked_token_identity: Boolean(tokenName),
                },
                ai_second_opinion: {
                  recommendation: aiFallback.recommendation ?? null,
                  name_match_score: aiFallback.name_match_score ?? null,
                  approved: true,
                },
              },
            })
            .eq("id", doc.id);
          await admin.from("kyc_audit_log").insert({
            account_id: accountId,
            document_id: doc.id,
            action: "ai_fallback_approved",
            actor_role: "ai",
            notes:
              `DigiLocker name guard scored ${match.score.toFixed(2)} for "${verified.name || "?"}", ` +
              `but AI review of the certificate PDF matched the customer ` +
              `(name score ${(aiFallback.name_match_score ?? 0).toFixed(2)}) — auto-approved.`,
            metadata: {
              method: "digilocker",
              provider: provider.name,
              guard_score: match.score,
              ai_name_match_score: aiFallback.name_match_score ?? null,
              document_type: docType,
            },
          });
          return redirectToPortal("success");
        }
      } catch (e) {
        console.warn("[digilocker-callback] ai fallback failed:", (e as Error).message);
      }
    }

    if (!match.matches) {
      // Persist BOTH verdicts on the document so the review UI can show the
      // DigiLocker guard result next to the internal AI second opinion.
      await admin.from("kyc_documents")
        .update({
          status: "pending_verification",
          metadata: {
            ...docMetadata,
            name_match_guard: {
              score: Number(match.score.toFixed(3)),
              threshold: DEFAULT_THRESHOLD,
              expected_name: expectedName,
              matched_candidate: match.matchedCandidate,
              checked_token_identity: Boolean(tokenName),
            },
            ai_second_opinion: aiFallback
              ? {
                  recommendation: aiFallback.recommendation ?? null,
                  name_match_score: aiFallback.name_match_score ?? null,
                }
              : null,
          },
        })
        .eq("id", doc.id);
      const { data: acctPrev1 } = await admin
        .from("portal_accounts").select("kyc_status").eq("id", accountId).maybeSingle();
      const acctUpd1: Record<string, unknown> = {
        kyc_submitted_at: nowIso,
        kyc_rejection_reason: null,
      };
      if ((acctPrev1 as any)?.kyc_status !== "approved") {
        acctUpd1.kyc_status = "pending_verification";
      }
      await admin.from("portal_accounts").update(acctUpd1).eq("id", accountId);
      const aiNote = aiFallback
        ? ` AI second opinion: ${aiFallback.recommendation || "unavailable"}` +
          (typeof aiFallback.name_match_score === "number"
            ? ` (name ${(aiFallback.name_match_score * 100).toFixed(0)}%)`
            : "")
        : " AI second opinion: unavailable";
      await admin.from("kyc_audit_log").insert({
        account_id: accountId,
        document_id: doc.id,
        action: "name_mismatch",
        actor_role: "system",
        notes: `Verified "${verified.name || "?"}" vs expected "${expectedName || "?"}" (score ${match.score.toFixed(2)}).${aiNote}`,
        metadata: {
          method: "digilocker",
          provider: provider.name,
          score: match.score,
          threshold: DEFAULT_THRESHOLD,
          document_type: docType,
          ai_recommendation: aiFallback?.recommendation ?? null,
          ai_name_match_score: aiFallback?.name_match_score ?? null,
        },
      });
      const mismatchMsg =
        `Verified name "${verified.name || "?"}" does not match "${expectedName || "?"}" ` +
        `(score ${(match.score * 100).toFixed(0)}%).${aiNote}`;
      // ONE row only: admins see every notification regardless of target_role
      // (RLS "Admins can view all"), so a second admin-targeted row would
      // show reviewers the same alert twice.
      await admin.from("notifications").insert({
        target_role: "sales_manager",
        type: "kyc_name_mismatch",
        title: "KYC name mismatch needs review",
        message: mismatchMsg,
        account_id: accountId,
      });
      return redirectToPortal("mismatch");
    }

    await admin.from("portal_accounts").update({
      kyc_status: "approved",
      kyc_submitted_at: nowIso,
      kyc_reviewed_at: nowIso,
      kyc_rejection_reason: null,
    }).eq("id", accountId);

    // Newly-approved document supersedes any older rejected /
    // resubmission-required docs on this account.
    await admin.rpc("supersede_stale_kyc_documents", {
      _account_id: accountId,
      _approved_doc_id: doc.id,
    });

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
        document_type: docType,
      },
    });
    // Single row — admins see all notifications, sales managers see
    // sales-targeted ones, so one sales_manager row reaches both.
    await admin.from("notifications").insert({
      target_role: "sales_manager",
      type: "kyc_approved",
      title: "KYC approved",
      message: `KYC for "${expectedName || verified.name || "?"}" auto-approved via DigiLocker (name match ${(match.score * 100).toFixed(0)}%).`,
      account_id: accountId,
    });
    return redirectToPortal("success");
  }

  // ── LEGACY WEBHOOK PATH ────────────────────────────────────────────────
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rawBody = await req.text();

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

  // 4. Name-match guard — match the DigiLocker holder against ALL of the
  // customer's known names (contact full_name / primary_contact_name / latest
  // order customer_name); approve on the best. See the primary guard above.
  const { data: acct } = await admin
    .from("portal_accounts")
    .select("id, primary_contact_name, company_name")
    .eq("id", accountId)
    .maybeSingle();
  const { data: contact } = await admin
    .from("portal_contacts")
    .select("email, full_name")
    .eq("account_id", accountId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  let orderName: string | null = null;
  const contactEmail = (contact as any)?.email;
  if (contactEmail) {
    const { data: order } = await admin
      .from("orders")
      .select("customer_name")
      .ilike("customer_email", contactEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    orderName = (order as any)?.customer_name || null;
  }
  const candidates = [
    (contact as any)?.full_name,
    (acct as any)?.primary_contact_name,
    orderName,
  ];
  const match = matchBestName(verified.name, candidates);
  const expectedName = match.matchedCandidate ||
    candidates.find((c) => (c || "").trim()) || null;
  const nowIso = new Date().toISOString();

  if (!match.matches) {
    // Fallback to reviewer queue
    await admin
      .from("kyc_documents")
      .update({ status: "pending_verification" })
      .eq("id", doc.id);
    const { data: acctPrev2 } = await admin
      .from("portal_accounts").select("kyc_status").eq("id", accountId).maybeSingle();
    const acctUpd2: Record<string, unknown> = {
      aadhaar_last4: verified.aadhaarLast4,
      kyc_submitted_at: nowIso,
      kyc_rejection_reason: null,
    };
    if ((acctPrev2 as any)?.kyc_status !== "approved") {
      acctUpd2.kyc_status = "pending_verification";
    }
    await admin.from("portal_accounts").update(acctUpd2).eq("id", accountId);

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

    // ONE row only — admins see every notification regardless of
    // target_role, so a second admin-targeted row duplicates the alert.
    await admin.from("notifications").insert({
      target_role: "sales_manager",
      type: "kyc_name_mismatch",
      title: "KYC name mismatch needs review",
      message: `Verified name "${verified.name || "?"}" does not match "${expectedName || "?"}" (score ${(match.score * 100).toFixed(0)}%).`,
      account_id: accountId,
    });

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

  await admin.from("notifications").insert({
    target_role: "sales_manager",
    type: "kyc_approved",
    title: "KYC approved",
    message: `KYC for "${expectedName || verified.name || "?"}" auto-approved via DigiLocker (name match ${(match.score * 100).toFixed(0)}%).`,
    account_id: accountId,
  });

  return json({ ok: true, stage: "auto_approved", score: match.score });
});