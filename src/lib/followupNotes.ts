/** Predefined follow-up note snippets used by both the New Enquiry form
 *  and the Enquiry Details dialog. Salespeople can also type a custom note. */
export const FOLLOWUP_NOTE_OPTIONS = [
  "Requested callback",
  "Sent quotation — awaiting response",
  "Waiting for customer budget approval",
  "Customer comparing with other vendors",
  "Will confirm after demo/trial",
  "Payment pending",
  "Not reachable — retry later",
  "Ready to order — preparing PO",
] as const;

export type FollowupNote = (typeof FOLLOWUP_NOTE_OPTIONS)[number];

/** Canonical source options exposed in the New Enquiry form.
 *  Values MUST match keys in LeadSourceBadge SOURCE_CONFIG. */
export const ENQUIRY_SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "interakt", label: "Interakt" },
  { value: "myoperator", label: "MyOperator" },
  { value: "call", label: "Call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "website", label: "Website" },
  { value: "qform", label: "QForm" },
  { value: "walk_in", label: "Walk-in" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
];