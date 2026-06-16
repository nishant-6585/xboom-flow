import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  version: number;
  is_current: boolean;
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
  const [account, setAccount] = useState<KycAccountSummary | null>(null);
  const [documents, setDocuments] = useState<KycDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setLoading(false); return; }
    const { data: contact } = await supabase
      .from("portal_contacts")
      .select("account_id")
      .eq("auth_user_id", u.user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!contact?.account_id) { setLoading(false); return; }

    const [acctRes, docRes] = await Promise.all([
      supabase
        .from("portal_accounts")
        .select(
          "id, company_name, primary_contact_name, kyc_status, aadhaar_last4, kyc_submitted_at, kyc_reviewed_at, kyc_rejection_reason, assigned_rep_id",
        )
        .eq("id", contact.account_id)
        .maybeSingle(),
      supabase
        .from("kyc_documents")
        .select("*")
        .eq("account_id", contact.account_id)
        .order("uploaded_at", { ascending: false }),
    ]);
    setAccount((acctRes.data as any) ?? null);
    setDocuments(((docRes.data as any) ?? []) as KycDocumentRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const submitAadhaar = useCallback(async (aadhaarNumber: string, file: File) => {
    const cleaned = aadhaarNumber.replace(/\s+/g, "");
    if (!/^\d{12}$/.test(cleaned)) { toast.error("Aadhaar must be exactly 12 digits"); return false; }
    if (file.size > MAX_BYTES) { toast.error("File exceeds 10MB"); return false; }
    if (!ALLOWED_MIME.includes(file.type)) { toast.error("Only PDF / JPG / JPEG / PNG allowed"); return false; }
    if (!account?.id) { toast.error("No portal account found"); return false; }

    setSubmitting(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${account.id}/aadhaar/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { error } = await supabase.functions.invoke("kyc-handler", {
        body: {
          action: "submit",
          aadhaar_number: cleaned,
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

  return { account, documents, loading, submitting, refresh, submitAadhaar, getSignedUrl };
}

/** Flow-facing: queue of pending KYC submissions for staff review */
export interface KycQueueRow {
  account: KycAccountSummary;
  document: KycDocumentRow | null;
  customer_email: string | null;
  latest_order_number: string | null;
  rep_name: string | null;
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

  return { rows, loading, refresh, review, getSignedUrl, getAadhaarFull };
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