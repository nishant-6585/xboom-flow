import { describe, it, expect } from 'vitest';
import { canMarkDeliveryDone } from '../deliveryProofGuard';

describe('canMarkDeliveryDone', () => {
  it('allows office_pickup without any proof (proof is optional)', () => {
    const r = canMarkDeliveryDone({ delivery_mode: 'office_pickup' });
    expect(r.ok).toBe(true);
  });

  it('allows office_pickup with pending proof', () => {
    const r = canMarkDeliveryDone({
      delivery_mode: 'office_pickup',
      delivery_proof_url: 'delivery-proofs/x.jpg',
      delivery_proof_status: 'pending',
    });
    expect(r.ok).toBe(true);
  });

  it('allows office_pickup with approved proof', () => {
    const r = canMarkDeliveryDone({
      delivery_mode: 'office_pickup',
      delivery_proof_url: 'delivery-proofs/x.jpg',
      delivery_proof_status: 'approved',
    });
    expect(r.ok).toBe(true);
  });

  it('allows courier delivery without proof', () => {
    const r = canMarkDeliveryDone({
      delivery_mode: 'courier',
      courier_name: 'Delhivery',
    });
    expect(r.ok).toBe(true);
  });

  it('allows "Office Delivery" courier without proof', () => {
    const r = canMarkDeliveryDone({
      delivery_mode: 'courier',
      courier_name: 'Office Delivery',
    });
    expect(r.ok).toBe(true);
  });

  it('allows even when proof was rejected (proof is optional)', () => {
    const r = canMarkDeliveryDone({
      delivery_mode: 'office_pickup',
      delivery_proof_url: 'delivery-proofs/x.jpg',
      delivery_proof_status: 'rejected',
    });
    expect(r.ok).toBe(true);
  });
});