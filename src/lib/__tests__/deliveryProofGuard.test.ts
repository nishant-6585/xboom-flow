import { describe, it, expect } from 'vitest';
import { canMarkDeliveryDone } from '../deliveryProofGuard';

describe('canMarkDeliveryDone', () => {
  it('blocks office_pickup without any proof', () => {
    const r = canMarkDeliveryDone({ delivery_mode: 'office_pickup' });
    if (r.ok) throw new Error('expected block');
    expect(r.reason).toMatch(/approved delivery photo/i);
  });

  it('blocks office_pickup with pending (unapproved) proof', () => {
    const r = canMarkDeliveryDone({
      delivery_mode: 'office_pickup',
      delivery_proof_url: 'delivery-proofs/x.jpg',
      delivery_proof_status: 'pending',
    });
    if (r.ok) throw new Error('expected block');
    expect(r.reason).toMatch(/awaiting approval/i);
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

  it('treats "Office Delivery" courier as office pickup and blocks without proof', () => {
    const r = canMarkDeliveryDone({
      delivery_mode: 'courier',
      courier_name: 'Office Delivery',
    });
    expect(r.ok).toBe(false);
  });

  it('blocks rejected proof', () => {
    const r = canMarkDeliveryDone({
      delivery_mode: 'office_pickup',
      delivery_proof_url: 'delivery-proofs/x.jpg',
      delivery_proof_status: 'rejected',
    });
    expect(r.ok).toBe(false);
  });
});