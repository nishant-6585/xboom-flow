// Shared types + helpers for salesperson-attribution evidence.
//
// Approvers require proof that the rep actually closed a website order before
// crediting it. Evidence rides as a jsonb array on sales_attribution_requests
// (rep flow) and sales_attribution_log (direct changes by admin/sales_manager/
// granted users). Two item shapes:
//   call_log — picked from the synced MyOperator/Exotel call_logs, pre-filtered
//              to the order's customer phone → self-verifying (number matches,
//              timestamp visible). The strong proof.
//   file     — uploaded document (WhatsApp export, email PDF, quote…), stored in
//              the private `attribution-evidence` bucket under <uid>/<order>/.

export interface CallLogEvidence {
  type: 'call_log';
  call_log_id: string;
  caller_number: string;
  called_at: string; // call_logs.created_at
  duration: number | null; // seconds
  call_type: string | null;
  recording_url: string | null;
}

export interface FileEvidence {
  type: 'file';
  path: string; // storage path in attribution-evidence bucket
  name: string;
  size: number;
  mime: string;
}

export type AttributionEvidence = CallLogEvidence | FileEvidence;

export const EVIDENCE_BUCKET = 'attribution-evidence';

/** Last 10 digits of a phone — normalizes +91 / spaces / dashes for matching. */
export function last10Digits(phone: string | null | undefined): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/** True when the evidence timestamp pre-dates the order — the strong signal. */
export function isBeforeOrder(
  evidenceAt: string | null | undefined,
  orderAt: string | null | undefined,
): boolean {
  if (!evidenceAt || !orderAt) return false;
  return new Date(evidenceAt).getTime() < new Date(orderAt).getTime();
}

export function formatCallDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Defensive parse of the jsonb evidence column. */
export function parseEvidence(raw: unknown): AttributionEvidence[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is AttributionEvidence =>
      !!e && typeof e === 'object' &&
      ((e as any).type === 'call_log' || (e as any).type === 'file'),
  );
}
