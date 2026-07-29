import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePortalAuth } from "@/portal/hooks/usePortalAuth";

export type KycStatus =
  | "not_submitted"
  | "pending_verification"
  | "approved"
  | "rejected"
  | "resubmission_required";

export interface KycAccountSummary {
  id: string;
  company_name: string | null;
  primary_contact_name: string | null;
  kyc_status: KycStatus;
  aadhaar_last4: string | null;
  kyc_submitted_at: string | null;
  kyc_reviewed_at: string | null;
  kyc_rejection_reason: string | null;
  assigned_rep_id: string | null;
}

export interface KycDocumentRow {
  id: string;
  account_id: string;
  doc_type: string;
  file_path: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string | null;
  status: KycStatus;
  rejection_reason: string | null;
  uploaded_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  method: string | null;
  version: number;
  is_current: boolean;
  metadata?: Record<string, any> | null;
  superseded_by?: string | null;
  superseded_at?: string | null;
}

/** Status label + Tailwind classes shared across portal & flow */
export function kycStatusMeta(s: KycStatus) {
  switch (s) {
    case "approved":
      return { label: "Approved", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
    case "pending_verification":
      return { label: "Pending Verification", className: "bg-amber-100 text-amber-800 border-amber-200" };
    case "rejected":
      return { label: "Rejected", className: "bg-red-100 text-red-800 border-red-200" };
    case "resubmission_required":
      return { label: "Resubmission Required", className: "bg-orange-100 text-orange-800 border-orange-200" };
    default:
      return { label: "Not Submitted", className: "bg-slate-100 text-slate-700 border-slate-200" };
  }
}

const BUCKET = "kyc-documents";
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const MAX_BYTES = 10 * 1024 * 1024;

/** Portal-facing: current customer's own KYC */
export function useMyKyc() {
  // Reuse the portal auth context — it already resolved the caller's
  // portal_contact + portal_account on login, so we don't need to re-run
  // supabase.auth.getUser() + a portal_contacts lookup on every page.
  const { account: portalAccount, loading: portalLoading } = usePortalAuth();
  const accountId = portalAccount?.id ?? null;
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  // Shared react-query cache keyed on accountId — every page (dashboard,
  // KYC verification, confirm) hits the SAME cache, so they can't drift
  // out of sync the way per-component useState hooks could.
  const query = useQuery({
    queryKey: ["portal", "my-kyc", accountId],
    enabled: !!accountId,
    staleTime: 30_000,
    queryFn: async () => {
      const [acctRes, docRes] = await Promise.all([
        supabase
          .from("portal_accounts")
          .select(
            "id, company_name, primary_contact_name, kyc_status, aadhaar_last4, kyc_submitted_at, kyc_reviewed_at, kyc_rejection_reason, assigned_rep_id",
          )
          .eq("id", accountId as string)
          .maybeSingle(),
        supabase
          .from("kyc_documents")
          .select("*")
          .eq("account_id", accountId as string)
          .order("uploaded_at", { ascending: false }),
      ]);
      if (acctRes.error) throw acctRes.error;
      const all = ((docRes.data as any) ?? []) as KycDocumentRow[];
      return {
        account: (acctRes.data as KycAccountSummary | null) ?? null,
        // Every screen renders only currently-active documents. Superseded
        // / historical rows are exposed separately via `documentHistory`.
        documents: all.filter((d) => d.is_current === true),
        documentHistory: all.filter((d) => d.is_current === false),
      };
    },
  });

  const account = query.data?.account ?? null;
  const documents = query.data?.documents ?? [];
  const documentHistory = query.data?.documentHistory ?? [];
  // "loading" is true while portal auth hasn't resolved OR while the KYC
  // query is in-flight for a resolved accountId.
  const loading = portalLoading || (!!accountId && query.isLoading);

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["portal", "my-kyc", accountId] });
  }, [qc, accountId]);

  const submitDocument = useCallback(async (opts: {
    documentType: string;
    documentNumber: string;
    file: File;
  }) => {
    const { documentType, documentNumber, file } = opts;
    if (file.size > MAX_BYTES) { toast.error("File exceeds 10MB"); return false; }
    if (!ALLOWED_MIME.includes(file.type)) { toast.error("Only PDF / JPG / JPEG / PNG allowed"); return false; }
    if (!account?.id) { toast.error("No portal account found"); return false; }

    setSubmitting(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${account.id}/${documentType}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { error } = await supabase.functions.invoke("kyc-handler", {
        body: {
          action: "submit",
          document_type: documentType,
          document_number: documentNumber,
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
        },
      });
      if (error) throw error;
      toast.success("KYC submitted. We'll review it shortly.");
      await refresh();
      return true;
    } catch (e: any) {
      toast.error(e.message ?? "Submission failed");
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [account?.id, refresh]);

  const getSignedUrl = useCallback(async (path: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error) throw error;
    return data.signedUrl;
  }, []);

  return { account, documents, documentHistory, loading, submitting, refresh, submitDocument, getSignedUrl };
}

/** Flow-facing: queue of pending KYC submissions for staff review */
export interface KycQueueRow {
  account: KycAccountSummary;
  document: KycDocumentRow | null;
  customer_email: string | null;
  latest_order_number: string | null;
  rep_name: string | null;
  reviewer_name: string | null;
  ai_review: AiKycReview | null;
}

export interface AiKycReview {
  id: string;
  document_id: string;
  extracted_doc_type: string | null;
  extracted_holder_name: string | null;
  extracted_number_masked: string | null;
  declared_doc_type: string | null;
  declared_number_masked: string | null;
  expected_name: string | null;
  name_match_score: number | null;
  number_match: boolean | null;
  type_match: boolean | null;
  legibility: string | null;
  ai_confidence: number | null;
  recommendation: "likely_approve" | "likely_reject" | "unclear" | string;
  decision: "auto_approved" | "pending" | "error" | string;
  flags: string[];
  model: string | null;
  error: string | null;
  created_at: string;
}

export function useKycQueue() {
  const [rows, setRows] = useState<KycQueueRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: accts } = await supabase
      .from("portal_accounts")
      .select(
        "id, company_name, primary_contact_name, kyc_status, aadhaar_last4, kyc_submitted_at, kyc_reviewed_at, kyc_rejection_reason, assigned_rep_id",
      )
      .neq("kyc_status", "not_submitted")
      .order("kyc_submitted_at", { ascending: false, nullsFirst: false });

    const accounts = (accts as any as KycAccountSummary[]) || [];
    if (accounts.length === 0) { setRows([]); setLoading(false); return; }

    const ids = accounts.map((a) => a.id);
    const repIds = Array.from(new Set(accounts.map((a) => a.assigned_rep_id).filter(Boolean) as string[]));

    const [docsRes, contactsRes, profilesRes] = await Promise.all([
      supabase
        .from("kyc_documents")
        .select("*")
        .in("account_id", ids)
        .eq("is_current", true),
      supabase
        .from("portal_contacts")
        .select("account_id, email")
        .in("account_id", ids)
        .eq("is_active", true),
      repIds.length
        ? supabase.from("profiles").select("user_id, name").in("user_id", repIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const docs = (docsRes.data as any as KycDocumentRow[]) || [];
    const contacts = (contactsRes.data as any[]) || [];
    const profiles = ((profilesRes as any).data as any[]) || [];

    // Latest AI review per document (most recent row wins).
    const docIds = docs.map((d) => d.id);
    let aiReviewByDoc: Record<string, AiKycReview> = {};
    if (docIds.length) {
      const { data: aiRows } = await (supabase as any)
        .from("ai_kyc_reviews")
        .select("*")
        .in("document_id", docIds)
        .order("created_at", { ascending: false });
      for (const r of (aiRows as any[]) || []) {
        if (!aiReviewByDoc[r.document_id]) aiReviewByDoc[r.document_id] = r as AiKycReview;
      }
    }

    // Resolve reviewer names for docs that were manually reviewed by staff.
    const reviewerIds = Array.from(
      new Set(docs.map((d) => d.reviewed_by).filter(Boolean) as string[]),
    );
    let reviewerMap: Record<string, string> = {};
    if (reviewerIds.length) {
      const { data: reviewers } = await supabase
        .from("profiles")
        .select("user_id, name")
        .in("user_id", reviewerIds);
      for (const p of (reviewers as any[]) || []) {
        if (p?.user_id) reviewerMap[p.user_id] = p.name ?? null;
      }
    }

    // Fetch latest order_number per email
    const emails = Array.from(new Set(contacts.map((c: any) => c.email).filter(Boolean)));
    let ordersByEmail: Record<string, string> = {};
    if (emails.length) {
      const { data: orders } = await supabase
        .from("orders")
        .select("order_number, customer_email, created_at")
        .in("customer_email", emails as string[])
        .order("created_at", { ascending: false });
      for (const o of (orders as any[]) || []) {
        const k = (o.customer_email || "").toLowerCase();
        if (k && !ordersByEmail[k]) ordersByEmail[k] = o.order_number;
      }
    }

    setRows(
      accounts.map((a) => {
        const doc = docs.find((d) => d.account_id === a.id) || null;
        const c = contacts.find((x: any) => x.account_id === a.id);
        const email = (c?.email as string) || null;
        const rep = profiles.find((p) => p.user_id === a.assigned_rep_id);
        return {
          account: a,
          document: doc,
          customer_email: email,
          latest_order_number: email ? ordersByEmail[email.toLowerCase()] || null : null,
          rep_name: rep?.name ?? null,
          reviewer_name: doc?.reviewed_by ? reviewerMap[doc.reviewed_by] ?? null : null,
          ai_review: doc ? aiReviewByDoc[doc.id] ?? null : null,
        };
      }),
    );
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const review = useCallback(
    async (accountId: string, documentId: string, decision: "approve" | "reject", reason?: string) => {
      const { error } = await supabase.functions.invoke("kyc-handler", {
        body: { action: "review", account_id: accountId, document_id: documentId, decision, reason },
      });
      if (error) { toast.error(error.message); return false; }
      toast.success(decision === "approve" ? "KYC approved" : "KYC rejected");
      await refresh();
      return true;
    },
    [refresh],
  );

  // Re-run the AI review for a manual-upload document (e.g. after a matcher fix,
  // or an earlier AI error). Note: ai-kyc-review intentionally skips DigiLocker
  // docs and already-approved accounts — it reports that back via `skipped`.
  const rerunAiReview = useCallback(
    async (accountId: string, documentId: string, digilockerFallback = false) => {
      const { data, error } = await supabase.functions.invoke("ai-kyc-review", {
        body: {
          document_id: documentId,
          account_id: accountId,
          // DigiLocker docs are normally skipped by the AI reviewer; this flag
          // asks it for a second opinion on the certificate PDF (used when the
          // name-match guard parked a government-verified doc in the queue).
          digilocker_fallback: digilockerFallback,
        },
      });
      if (error) { toast.error(error.message); return false; }
      const skipped = (data as any)?.skipped;
      if (skipped) {
        toast.info(`XBoomFlow AI review skipped (${skipped})`);
      } else {
        toast.success("XBoomFlow AI review complete");
      }
      await refresh();
      return true;
    },
    [refresh],
  );

  const getSignedUrl = useCallback(async (path: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error) throw error;
    return data.signedUrl;
  }, []);

  const getAadhaarFull = useCallback(async (accountId: string) => {
    const { data, error } = await supabase.rpc("get_kyc_aadhaar_full", { _account_id: accountId });
    if (error) throw error;
    return data as string | null;
  }, []);

  return { rows, loading, refresh, review, rerunAiReview, getSignedUrl, getAadhaarFull };
}

/** Per-order KYC status (resolved by customer_email → portal_account) */
export function useOrderKycStatus(customerEmail: string | null | undefined) {
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!customerEmail) { setStatus(null); return; }
    setLoading(true);
    (async () => {
      const { data: contact } = await supabase
        .from("portal_contacts")
        .select("account_id")
        .ilike("email", customerEmail)
        .maybeSingle();
      if (!contact?.account_id) { if (!cancelled) { setStatus(null); setLoading(false); } return; }
      const { data: acct } = await supabase
        .from("portal_accounts")
        .select("kyc_status")
        .eq("id", contact.account_id)
        .maybeSingle();
      if (!cancelled) { setStatus(((acct as any)?.kyc_status as KycStatus) ?? "not_submitted"); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [customerEmail]);

  return { status, loading };
}