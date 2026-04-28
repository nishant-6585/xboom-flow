import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  classifyStorageError,
  FRIENDLY,
  type SignedUrlFailureReason as ClassifyReason,
} from "./hrDocumentsClassify";

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

/**
 * Throttled subtle warning when the audit RPC itself fails. We don't want
 * to spam HR with one toast per failed access attempt — once every few
 * minutes is enough to prompt them to check backend logs.
 */
const AUDIT_WARN_COOLDOWN_MS = 5 * 60 * 1000;
let lastAuditWarnAt = 0;
function notifyAuditPipelineBroken(detail?: string) {
  const now = Date.now();
  if (now - lastAuditWarnAt < AUDIT_WARN_COOLDOWN_MS) return;
  lastAuditWarnAt = now;
  toast.warning("Resume access audit log isn't recording", {
    description:
      detail ||
      "Failures aren't being persisted. Please check backend logging.",
    duration: 6000,
  });
}

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
    // Fire-and-forget, but observe the result so we can warn HR/Admin
    // when the audit pipeline itself is broken (RPC missing, RLS denied,
    // network error, etc.).
    void (async () => {
      try {
        // Best-effort capture of the authenticated user id as a client hint.
        // The server-side RPC should still derive the canonical actor from
        // auth.uid() — this is included only to aid debugging when the
        // session token is stale or unexpectedly anonymous.
        let actorUserId: string | null = null;
        try {
          const { data } = await supabase.auth.getUser();
          actorUserId = data?.user?.id ?? null;
        } catch {
          // ignore — auth lookup failures shouldn't block audit best-effort
        }

        const { error } = await (supabase as any).rpc(
          "log_resume_access_failure",
          {
            _referral_id: auditReferralId ?? null,
            _document_path: path ?? null,
            _reason: failure.reason,
            _error_message: failure.message,
            _source: auditSource ?? null,
            _actor_user_id: actorUserId,
            _user_agent:
              typeof navigator !== "undefined" ? navigator.userAgent : null,
          }
        );
        if (error) notifyAuditPipelineBroken(error.message);
      } catch (e: any) {
        notifyAuditPipelineBroken(e?.message);
      }
    })();
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
      const { reason, friendly } = classifyStorageError(error);
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
    // Network / unexpected throw — let the classifier inspect status & message
    // (covers cross-browser "Failed to fetch" / "Load failed" / "NetworkError").
    const { reason, friendly } = classifyStorageError(e);
    const failure: SignedUrlFailure = {
      ok: false,
      reason,
      message:
        reason === "unknown"
          ? e?.message || "Unexpected error opening document"
          : friendly,
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
  /**
   * Audit context used to record the retry click (separate from the
   * original failure record). When omitted, the retry is still triggered
   * but no audit row is written.
   */
  retryAudit?: {
    referralId?: string | null;
    documentPath?: string | null;
    source?: string | null;
  };
};

const TRANSIENT_FAILURE_REASONS: SignedUrlFailureReason[] = [
  "forbidden",
  "unknown",
];

function logRetryAttempt(opts: NotifyOptions["retryAudit"]) {
  if (!opts) return;
  void (async () => {
    try {
      await (supabase as any).rpc("log_resume_access_retry", {
        _retry_of_failure_id: null,
        _referral_id: opts.referralId ?? null,
        _document_path: opts.documentPath ?? null,
        _source: opts.source ?? null,
        _user_agent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
      });
    } catch {
      // Non-blocking — the retry itself is what matters for the user.
    }
  })();
}

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
          logRetryAttempt(opts.retryAudit);
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