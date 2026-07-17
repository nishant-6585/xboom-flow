/**
 * Client-side pre-check that mirrors the server-side delivery-proof trigger.
 * The database is the source of truth — this exists only to give the user a
 * clear, immediate message before we send an update that would be rejected.
 */

export interface DeliveryProofOrderLike {
  delivery_mode?: string | null;
  courier_name?: string | null;
  delivery_proof_url?: string | null;
  delivery_proof_status?: string | null;
}

export type DeliveryProofCheck =
  | { ok: true }
  | { ok: false; reason: string };

// Mirrors the courier-name regex enforced by trg_enforce_office_delivery_proof.
const OFFICE_COURIER_RE =
  /(office\s*deliver|office\s*pickup|self\s*deliver|hand\s*deliver|walk[-\s]?in|showroom|^\s*bus\s*$)/i;

export function requiresDeliveryProof(order: DeliveryProofOrderLike): boolean {
  if (order.delivery_mode === 'office_pickup') return true;
  if (order.courier_name && OFFICE_COURIER_RE.test(order.courier_name)) return true;
  return false;
}

export function canMarkDeliveryDone(order: DeliveryProofOrderLike): DeliveryProofCheck {
  if (!requiresDeliveryProof(order)) return { ok: true };

  if (!order.delivery_proof_url) {
    return {
      ok: false,
      reason:
        'Office-pickup orders need an approved delivery photo before they can be marked delivered. Upload one in the Delivery Proof section of this order.',
    };
  }

  if (order.delivery_proof_status !== 'approved') {
    return {
      ok: false,
      reason:
        'The uploaded delivery photo is still awaiting approval. An admin or sales manager must approve it in the Delivery Proof section before this order can be marked delivered.',
    };
  }

  return { ok: true };
}