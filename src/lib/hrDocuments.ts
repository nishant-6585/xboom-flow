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
 *   - Server-side failure audit trail
 */

export const HR_DOCUMENTS_BUCKET = "hr-documents";

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
  bucket?: string;
  ttlSeconds?: number;
  resumeOnly?: boolean;
  /**
   * If provided, signed-URL generation failures are recorded server-side
   * against this referral via `log_resume_access_failure`. No-ops when omitted.
   */
  auditReferralId?: string;
};

const recordFailure = (
  failure: SignedUrlFailure,
  attemptedPath: string | null | undefined,
  referralId: string | undefined
): void => {
  // Fire-and-forget; never block the user-facing flow on audit issues.
  try {
    void (supabase as any)
      .rpc("log_resume_access_failure", {
        _referral_id: referralId ?? null,
        _document_path: attemptedPath ?? null,
        _reason: failure.reason,
        _error_message: failure.message ?? null,
        _user_agent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
      })
      ?.then?.(() => undefined)
      ?.catch?.(() => undefined);
  } catch {
    // Swallow — audit must never break access flows
  }
};

export async function createHrDocumentSignedUrl(
  path: string | null | undefined,
  opts: CreateSignedUrlOptions = {}
): Promise<SignedUrlResult> {
  const {
    bucket = HR_DOCUMENTS_BUCKET,
    ttlSeconds = 60 * 5,
    resumeOnly = false,
    auditReferralId,
  } = opts;

  if (!path || !path.trim()) {
    const failure: SignedUrlFailure = {
      ok: false,
      reason: "missing_path",
      message: "Document file is missing",
    };
    recordFailure(failure, path, auditReferralId);
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
    recordFailure(failure, path, auditReferralId);
    return failure;
  }

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, ttlSeconds);

    if (error) {
      const { reason, friendly } = classifyStorageError(error.message);
      const failure: SignedUrlFailure = { ok: false, reason, message: friendly };
      recordFailure(failure, path, auditReferralId);
      return failure;
    }
    if (!data?.signedUrl) {
      const failure: SignedUrlFailure = {
        ok: false,
        reason: "unknown",
        message: "Could not generate download link",
      };
      recordFailure(failure, path, auditReferralId);
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
    recordFailure(failure, path, auditReferralId);
    return failure;
  }
}

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

export function triggerDownload(url: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}