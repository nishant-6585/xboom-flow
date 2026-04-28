import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Shared helpers for accessing private HR documents (resumes, offer letters, etc.)
 * stored in the `hr-documents` Supabase Storage bucket.
 *
 * All callers should use these helpers to guarantee consistent:
 *   - Path validation
 *   - Format gating (PDF-only for resumes)
 *   - Signed URL error → toast mapping
 */

export const HR_DOCUMENTS_BUCKET = "hr-documents";

/** Resume formats accepted across the app. */
export const SUPPORTED_RESUME_EXTS = ["pdf"] as const;
export type SupportedResumeExt = (typeof SUPPORTED_RESUME_EXTS)[number];

export type SignedUrlSuccess = {
  readonly ok: true;
  url: string;
  path: string;
  expiresAt: number;
};

export type SignedUrlFailureReason =
  | "missing_path"
  | "unsupported_format"
  | "not_found"
  | "forbidden"
  | "unknown";

export type SignedUrlFailure = {
  readonly ok: false;
  reason: SignedUrlFailureReason;
  message: string;
  ext?: string;
};

export type SignedUrlResult = SignedUrlSuccess | SignedUrlFailure;

export const getDocumentExt = (path: string | null | undefined): string => {
  if (!path) return "";
  const name = path.split("/").pop() || "";
  return (name.split(".").pop() || "").toLowerCase();
};

export const isSupportedResume = (path: string | null | undefined): boolean =>
  SUPPORTED_RESUME_EXTS.includes(getDocumentExt(path) as SupportedResumeExt);

const classifyStorageError = (
  message: string | undefined
): { reason: SignedUrlFailureReason; friendly: string } => {
  const msg = (message || "").toLowerCase();
  if (msg.includes("not found") || msg.includes("object")) {
    return { reason: "not_found", friendly: "Document not found in storage" };
  }
  if (
    msg.includes("permission") ||
    msg.includes("denied") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("policy")
  ) {
    return {
      reason: "forbidden",
      friendly: "You do not have permission to access this document",
    };
  }
  return {
    reason: "unknown",
    friendly: message || "Could not generate download link",
  };
};

export type CreateSignedUrlOptions = {
  /** Bucket name (defaults to hr-documents). */
  bucket?: string;
  /** TTL in seconds (defaults to 5 min). */
  ttlSeconds?: number;
  /** When true, only PDF resumes are allowed. */
  resumeOnly?: boolean;
  /**
   * Optional referral id used for audit logging when signed URL
   * generation fails. Fire-and-forget — never blocks the caller.
   */
  auditReferralId?: string;
  /**
   * Optional UI/source context (e.g. "hr.referrals_panel",
   * "sales.candidate_drawer") logged alongside the failure to make
   * debugging which surface triggered the access easier.
   */
  auditSource?: string;
};

/**
 * Create a signed URL for an HR document with consistent validation
 * and structured failure reasons. Does NOT show toasts — use
 * `notifySignedUrlFailure` if you want the standard messaging.
 */
export async function createHrDocumentSignedUrl(
  path: string | null | undefined,
  opts: CreateSignedUrlOptions = {}
): Promise<SignedUrlResult> {
  const {
    bucket = HR_DOCUMENTS_BUCKET,
    ttlSeconds = 60 * 5,
    resumeOnly = false,
    auditReferralId,
    auditSource,
  } = opts;

  const recordFailure = (failure: SignedUrlFailure) => {
    try {
      void (supabase as any).rpc("log_resume_access_failure", {
        _referral_id: auditReferralId ?? null,
        _document_path: path ?? null,
        _reason: failure.reason,
        _error_message: failure.message,
        _source: auditSource ?? null,
        _user_agent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
      });
    } catch {
      // Non-blocking: audit failure must not break document access UX.
    }
  };

  if (!path || !path.trim()) {
    const failure: SignedUrlFailure = {
      ok: false,
      reason: "missing_path",
      message: "Document file is missing",
    };
    recordFailure(failure);
    return failure;
  }

  if (resumeOnly && !isSupportedResume(path)) {
    const ext = getDocumentExt(path);
    const failure: SignedUrlFailure = {
      ok: false,
      reason: "unsupported_format",
      ext,
      message: ext
        ? `Only PDF resumes are supported. This file is .${ext}.`
        : "Only PDF resumes are supported.",
    };
    recordFailure(failure);
    return failure;
  }

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, ttlSeconds);

    if (error) {
      const { reason, friendly } = classifyStorageError(error.message);
      const failure: SignedUrlFailure = { ok: false, reason, message: friendly };
      recordFailure(failure);
      return failure;
    }
    if (!data?.signedUrl) {
      const failure: SignedUrlFailure = {
        ok: false,
        reason: "unknown",
        message: "Could not generate download link",
      };
      recordFailure(failure);
      return failure;
    }
    return {
      ok: true,
      url: data.signedUrl,
      path,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
  } catch (e: any) {
    const failure: SignedUrlFailure = {
      ok: false,
      reason: "unknown",
      message: e?.message || "Unexpected error opening document",
    };
    recordFailure(failure);
    return failure;
  }
}

/** Standard toast messaging for a failed signed URL request. */
export type NotifyOptions = {
  /**
   * Async retry callback. When provided AND the failure is transient
   * (e.g. permission/unknown), an inline "Retry" action is added to the toast.
   */
  onRetry?: () => void | Promise<void>;
};

const TRANSIENT_FAILURE_REASONS: SignedUrlFailureReason[] = [
  "forbidden",
  "unknown",
];

export function notifySignedUrlFailure(
  failure: SignedUrlFailure,
  opts: NotifyOptions = {}
): void {
  const canRetry =
    !!opts.onRetry && TRANSIENT_FAILURE_REASONS.includes(failure.reason);

  if (canRetry) {
    toast.error(failure.message, {
      action: {
        label: "Retry",
        onClick: () => {
          void opts.onRetry?.();
        },
      },
      duration: 8000,
    });
    return;
  }

  toast.error(failure.message);
}

/** Trigger a browser download for a signed URL. */
export function triggerDownload(url: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}