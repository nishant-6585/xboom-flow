import { getSlaStatus, UrgencyLevel } from "@/lib/sla";

export type SlaEnquiryLike = {
  id: string;
  created_at: string;
  responded_at?: string | null;
  urgency?: string | null;
  status?: string | null;
};

export type SlaCounts = {
  approaching: number;
  breached: number;
  atRiskIds: string[];
  breachedIds: string[];
};

/**
 * Compute SLA counts for a list of enquiries. Considers only unresponded,
 * non-cancelled enquiries. Wraps the shared getSlaStatus() so any SLA badge
 * / stat / banner uses one source of truth.
 */
export function computeEnquirySlaCounts(enquiries: SlaEnquiryLike[]): SlaCounts {
  const atRiskIds: string[] = [];
  const breachedIds: string[] = [];
  for (const e of enquiries) {
    if (e.responded_at) continue;
    if ((e.status || "").toLowerCase() === "cancelled") continue;
    const urgency = (e.urgency || "medium").toLowerCase() as UrgencyLevel;
    const status = getSlaStatus(new Date(e.created_at), null, urgency, false);
    if (status === "at_risk") atRiskIds.push(e.id);
    else if (status === "breached") breachedIds.push(e.id);
  }
  return {
    approaching: atRiskIds.length,
    breached: breachedIds.length,
    atRiskIds,
    breachedIds,
  };
}