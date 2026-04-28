/**
 * Pure classifier for HR document signed-URL errors.
 *
 * Lives in its own module (no Supabase / sonner imports) so it can be
 * unit-tested with representative error shapes from Chromium, Safari, and
 * Firefox without pulling the entire client.
 */

export type SignedUrlFailureReason =
  | "missing_path"
  | "unsupported_format"
  | "not_found"
  | "forbidden"
  | "unknown";

export const FRIENDLY: Record<SignedUrlFailureReason, string> = {
  missing_path: "Document file is missing",
  unsupported_format: "Unsupported document format",
  not_found: "Document not found in storage",
  forbidden: "You do not have permission to access this document",
  unknown: "Could not generate download link",
};

/**
 * Longer, user-facing description shown alongside the short title in
 * toasts and inline failure UI. Kept here (not in components) so every
 * surface renders the exact same wording per reason.
 */
export const FRIENDLY_DESCRIPTION: Record<SignedUrlFailureReason, string> = {
  missing_path:
    "No file is attached to this record yet. Ask the candidate or HR to upload the document.",
  unsupported_format:
    "Only PDF resumes are supported. Please re-upload the document as a PDF.",
  not_found:
    "The file may have been moved or deleted. Try refreshing, or re-upload the document.",
  forbidden:
    "Your account doesn't have access to this document. Contact HR or an administrator if you believe this is a mistake.",
  unknown:
    "Something went wrong reaching storage. This is usually temporary — please retry in a moment.",
};

/** Convenience accessor returning both lines for a given reason. */
export function friendlyMessageFor(reason: SignedUrlFailureReason): {
  title: string;
  description: string;
} {
  return {
    title: FRIENDLY[reason] ?? FRIENDLY.unknown,
    description: FRIENDLY_DESCRIPTION[reason] ?? FRIENDLY_DESCRIPTION.unknown,
  };
}

const STATUS_REASON: Record<number, SignedUrlFailureReason> = {
  400: "unknown",
  401: "forbidden",
  403: "forbidden",
  404: "not_found",
  410: "not_found",
  // 5xx & other transient codes intentionally fall through to "unknown".
};

const SLUG_REASON: Record<string, SignedUrlFailureReason> = {
  notfound: "not_found",
  not_found: "not_found",
  objectnotfound: "not_found",
  unauthorized: "forbidden",
  forbidden: "forbidden",
  permissiondenied: "forbidden",
  accessdenied: "forbidden",
};

/** Word-boundary keyword matchers — order matters: more specific first. */
const KEYWORD_RULES: Array<{ re: RegExp; reason: SignedUrlFailureReason }> = [
  {
    re: /\b(forbidden|unauthori[sz]ed|permission\s+denied|access\s+denied|not\s+allowed|rls|row[\s-]?level\s+security|policy)\b/i,
    reason: "forbidden",
  },
  {
    re: /\b(not\s+found|no\s+such\s+(object|file|key)|object\s+does\s+not\s+exist|missing\s+object)\b/i,
    reason: "not_found",
  },
];

export type ClassificationSignals = {
  /** Numeric HTTP status extracted from the error, if any. */
  httpStatus: number | null;
  /** Normalized canonical error slug (lowercased, separators stripped), if any. */
  errorSlug: string | null;
  /** True iff the keyword regex fallback was the deciding signal. */
  keywordMatched: boolean;
};

export function classifyStorageError(
  err: unknown
): {
  reason: SignedUrlFailureReason;
  friendly: string;
  signals: ClassificationSignals;
} {
  const e: any =
    err && typeof err === "object" ? err : { message: String(err ?? "") };

  // 1) HTTP status code — most reliable signal.
  const rawStatus =
    e.statusCode ?? e.status ?? e.cause?.status ?? e.response?.status;
  const status =
    typeof rawStatus === "string" ? parseInt(rawStatus, 10) : rawStatus;
  const httpStatus =
    typeof status === "number" && Number.isFinite(status) ? status : null;

  // 2) Canonical error slug from Supabase Storage responses.
  const slugRaw = String(e.error ?? e.code ?? "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  const errorSlug = slugRaw || null;

  if (typeof status === "number" && Number.isFinite(status)) {
    const mapped = STATUS_REASON[status];
    if (mapped) {
      return {
        reason: mapped,
        friendly: FRIENDLY[mapped],
        signals: { httpStatus, errorSlug, keywordMatched: false },
      };
    }
  }

  if (errorSlug && SLUG_REASON[errorSlug]) {
    const reason = SLUG_REASON[errorSlug];
    return {
      reason,
      friendly: FRIENDLY[reason],
      signals: { httpStatus, errorSlug, keywordMatched: false },
    };
  }

  // 3) Word-boundary keyword fallback on the message string.
  const message = String(e.message ?? "");
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(message)) {
      return {
        reason: rule.reason,
        friendly: FRIENDLY[rule.reason],
        signals: { httpStatus, errorSlug, keywordMatched: true },
      };
    }
  }

  return {
    reason: "unknown",
    friendly: message || FRIENDLY.unknown,
    signals: { httpStatus, errorSlug, keywordMatched: false },
  };
}