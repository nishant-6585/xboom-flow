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

/**
 * Delivery mode implied by a courier name. Office/self/hand delivery and
 * showroom pickup map to office_pickup; anything else is a courier shipment.
 */
export function deliveryModeFromCourier(
  courierName: string | null | undefined,
): 'courier' | 'office_pickup' | null {
  const name = (courierName ?? '').trim();
  if (!name) return null;
  return OFFICE_COURIER_RE.test(name) ? 'office_pickup' : 'courier';
}

export function requiresDeliveryProof(order: DeliveryProofOrderLike): boolean {
  if (order.delivery_mode === 'office_pickup') return true;
  if (order.courier_name && OFFICE_COURIER_RE.test(order.courier_name)) return true;
  return false;
}

export function canMarkDeliveryDone(order: DeliveryProofOrderLike): DeliveryProofCheck {
  // Delivery photo is optional for all delivery modes, including office
  // pickup. Staff may still upload one for audit, but it is no longer
  // required to mark the order delivered.
  return { ok: true };
}