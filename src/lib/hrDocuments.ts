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
  ok: true;
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
  ok: false;
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
  const { bucket = HR_DOCUMENTS_BUCKET, ttlSeconds = 60 * 5, resumeOnly = false } = opts;

  if (!path || !path.trim()) {
    return {
      ok: false,
      reason: "missing_path",
      message: "Document file is missing",
    };
  }

  if (resumeOnly && !isSupportedResume(path)) {
    const ext = getDocumentExt(path);
    return {
      ok: false,
      reason: "unsupported_format",
      ext,
      message: ext
        ? `Only PDF resumes are supported. This file is .${ext}.`
        : "Only PDF resumes are supported.",
    };
  }

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, ttlSeconds);

    if (error) {
      const { reason, friendly } = classifyStorageError(error.message);
      return { ok: false, reason, message: friendly };
    }
    if (!data?.signedUrl) {
      return {
        ok: false,
        reason: "unknown",
        message: "Could not generate download link",
      };
    }
    return {
      ok: true,
      url: data.signedUrl,
      path,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
  } catch (e: any) {
    return {
      ok: false,
      reason: "unknown",
      message: e?.message || "Unexpected error opening document",
    };
  }
}

/** Standard toast messaging for a failed signed URL request. */
export function notifySignedUrlFailure(failure: SignedUrlFailure): void {
  if (failure.reason === "unsupported_format") {
    toast.error(failure.message);
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