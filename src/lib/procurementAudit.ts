import { recordAuditLog } from '@/lib/auditLog';

/**
 * Audit trail for procurement money movements.
 *
 * `security_audit_log` already existed and was wired into HR and salary, but not
 * into procurement — the one area where the highest-value, least-reversible
 * actions happen. Payments could be recorded, approved, completed and hard
 * deleted, and procurement rates rewritten, with nothing left behind but the
 * mutated row itself.
 *
 * These helpers are fire-and-forget: a failed audit write must never block or
 * fail the operation it is describing.
 */

export const PROCUREMENT_AUDIT_ACTIONS = {
  PAYMENT_RECORDED: 'PROCUREMENT_PAYMENT_RECORDED',
  PAYMENT_REQUESTED: 'PROCUREMENT_PAYMENT_REQUESTED',
  PAYMENT_APPROVED: 'PROCUREMENT_PAYMENT_APPROVED',
  PAYMENT_COMPLETED: 'PROCUREMENT_PAYMENT_COMPLETED',
  PAYMENT_REJECTED: 'PROCUREMENT_PAYMENT_REJECTED',
  PAYMENT_DELETED: 'PROCUREMENT_PAYMENT_DELETED',
  RATE_CHANGED: 'PROCUREMENT_RATE_CHANGED',
  IMPORT_CREATED: 'PROCUREMENT_IMPORT_CREATED',
  IMPORT_UPDATED: 'PROCUREMENT_IMPORT_UPDATED',
  IMPORT_DELETED: 'PROCUREMENT_IMPORT_DELETED',
  GRN_POSTED: 'PROCUREMENT_GRN_POSTED',
  GRN_CANCELLED: 'PROCUREMENT_GRN_CANCELLED',
} as const;

export type ProcurementAuditAction =
  (typeof PROCUREMENT_AUDIT_ACTIONS)[keyof typeof PROCUREMENT_AUDIT_ACTIONS];

export interface ProcurementAuditActor {
  id: string | undefined | null;
  name?: string | null;
}

/**
 * Record a procurement audit entry. Silently no-ops without an actor rather than
 * throwing — the caller has already checked auth, and an audit gap is preferable
 * to a crashed payment flow.
 */
export function recordProcurementAudit(
  actor: ProcurementAuditActor,
  action: ProcurementAuditAction,
  details: Record<string, unknown>
): void {
  if (!actor?.id) return;
  void recordAuditLog(actor.id, actor.name || 'Unknown', { action, details });
}

/**
 * Reduce a payment row to the fields worth keeping in the log. Screenshots and
 * free-text notes are deliberately excluded — the audit log is queried broadly
 * and should not become a second copy of the payment record.
 */
export function summarisePayment(payment: Record<string, unknown> | null | undefined) {
  if (!payment) return {};
  const field = (key: string) => payment[key] ?? null;
  return {
    payment_id: field('id'),
    supplier_id: field('supplier_id'),
    supplier_name: field('supplier_name'),
    amount: field('amount'),
    payment_date: field('payment_date'),
    payment_mode: field('payment_mode'),
    reference_number: field('reference_number'),
    order_id: field('order_id'),
    inventory_procurement_id: field('inventory_procurement_id'),
    payment_request_status: field('payment_request_status'),
  };
}
