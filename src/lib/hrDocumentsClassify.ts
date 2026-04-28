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

export function classifyStorageError(
  err: unknown
): { reason: SignedUrlFailureReason; friendly: string } {
  const e: any =
    err && typeof err === "object" ? err : { message: String(err ?? "") };

  // 1) HTTP status code — most reliable signal.
  const rawStatus =
    e.statusCode ?? e.status ?? e.cause?.status ?? e.response?.status;
  const status =
    typeof rawStatus === "string" ? parseInt(rawStatus, 10) : rawStatus;
  if (typeof status === "number" && Number.isFinite(status)) {
    const mapped = STATUS_REASON[status];
    if (mapped) {
      return { reason: mapped, friendly: FRIENDLY[mapped] };
    }
  }

  // 2) Canonical error slug from Supabase Storage responses.
  const slug = String(e.error ?? e.code ?? "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  if (slug && SLUG_REASON[slug]) {
    const reason = SLUG_REASON[slug];
    return { reason, friendly: FRIENDLY[reason] };
  }

  // 3) Word-boundary keyword fallback on the message string.
  const message = String(e.message ?? "");
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(message)) {
      return { reason: rule.reason, friendly: FRIENDLY[rule.reason] };
    }
  }

  return {
    reason: "unknown",
    friendly: message || FRIENDLY.unknown,
  };
}