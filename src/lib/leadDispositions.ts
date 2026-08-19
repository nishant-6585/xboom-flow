export type LeadDisposition = "untouched" | "prospect" | "qualified" | "not_qualified" | "junk";

/** Reason code stamped by the ingest auto-junk rule (never by a human). */
export const AUTO_JUNK_REASON_CODE = "auto_no_enquiry";

export interface DispositionReason {
  code: string;
  label: string;
}

export const QUALIFIED_REASONS: DispositionReason[] = [
  { code: "budget_confirmed", label: "Budget confirmed" },
  { code: "decision_maker_identified", label: "Decision-maker identified" },
  { code: "specific_use_case", label: "Specific use case & timeline confirmed" },
  { code: "existing_customer_expand", label: "Existing customer expanding" },
  { code: "strong_product_fit", label: "Strong product fit" },
  { code: "quote_requested", label: "Quote / pricing requested" },
  { code: "demo_scheduled", label: "Demo or trial scheduled" },
  { code: "procurement_started", label: "Procurement process started" },
  { code: "custom", label: "Other (specify)" },
];

export const NOT_QUALIFIED_REASONS: DispositionReason[] = [
  { code: "out_of_budget", label: "Out of budget" },
  { code: "wrong_geography", label: "Outside target geography" },
  { code: "wrong_product_fit", label: "Wrong product / not a fit" },
  { code: "hobbyist", label: "Hobbyist / personal use, not B2B" },
  { code: "window_shopping", label: "Browsing, no urgency or plans" },
  { code: "bought_competitor", label: "Already bought from competitor" },
  { code: "spam_or_bot", label: "Spam / bot / test submission" },
  { code: "duplicate_lead", label: "Duplicate of another lead" },
  { code: "wrong_industry", label: "Wrong industry for our products" },
  { code: "job_seeker", label: "Job-seeker disguised as lead" },
  { code: "unreachable", label: "Phone unreachable / no response" },
  { code: "do_not_contact", label: "Customer asked not to be contacted" },
  { code: "custom", label: "Other (specify)" },
];

export const JUNK_REASONS: DispositionReason[] = [
  { code: AUTO_JUNK_REASON_CODE, label: "No enquiry — auto-detected" },
  { code: "no_enquiry", label: "No enquiry / empty contact" },
  { code: "spam_or_bot", label: "Spam / bot / test submission" },
  { code: "wrong_number", label: "Wrong or unusable number" },
  { code: "custom", label: "Other (specify)" },
];

/**
 * True when the junk disposition came from the ingest rule rather than a person,
 * so a human decision stays distinguishable from the rule.
 */
export function isAutoDisposition(
  disposition: LeadDisposition | string | null | undefined,
  reasonCode: string | null | undefined,
  dispositionByName?: string | null,
): boolean {
  return (
    disposition === "junk" &&
    (reasonCode === AUTO_JUNK_REASON_CODE || dispositionByName === "Auto rule")
  );
}

export function getDispositionLabel(d: LeadDisposition | string | null | undefined): string {
  switch (d) {
    case "untouched": return "New";
    case "prospect": return "Prospect";
    case "qualified": return "Qualified";
    case "not_qualified": return "Not Qualified";
    case "junk": return "Junk";
    default: return "Unknown";
  }
}

export function getDispositionBadgeClass(d: LeadDisposition | string | null | undefined): string {
  switch (d) {
    case "prospect": return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20";
    case "qualified": return "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20";
    case "not_qualified": return "bg-destructive/10 text-destructive border-destructive/20";
    case "junk": return "bg-muted text-muted-foreground border-border line-through decoration-muted-foreground/40";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

export function getReasonLabel(
  target: LeadDisposition,
  code: string | null | undefined,
): string {
  if (!code) return "—";
  const list =
    target === "qualified"
      ? QUALIFIED_REASONS
      : target === "junk"
      ? JUNK_REASONS
      : NOT_QUALIFIED_REASONS;
  return list.find((r) => r.code === code)?.label ?? code;
}

/**
 * Maps a unified-feed `source` slug to the actual source table name expected by
 * the `set_lead_disposition` RPC. ElevenLabs and MyOperator both live in `call_logs`.
 */
export const SOURCE_TO_TABLE: Record<string, string> = {
  website: "leads",
  forms: "form_leads",
  google_ads: "google_ads_leads",
  interakt: "interakt_leads",
  myoperator: "call_logs",
  elevenlabs: "call_logs",
  email: "email_leads",
};

export function getSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case "website": return "Website";
    case "forms": return "Forms";
    case "google_ads": return "Google Ads";
    case "interakt": return "WhatsApp";
    case "myoperator": return "Call";
    case "elevenlabs": return "Voice AI";
    case "email": return "Email";
    default: return source ?? "—";
  }
}