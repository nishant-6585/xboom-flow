import { describe, it, expect, vi } from 'vitest';
import { bulkAttributeWebsiteAuto } from '../bulkReassignWebsiteAuto';

// Integration test for the bulk reassign orchestrator. Every selected Woo
// external_id must resolve to an internal orders.id and be pushed through
// attribute_website_order — that is the RPC path the guard trigger uses to
// normalize source='manual' and set sales_attribution_locked=true. This
// test exercises the whole loop with 3 orders and asserts each one lands
// with the same salesperson/reason payload.

function makeSupabase(rows: Array<{ id: string; external_id: string }>) {
  const inFn = vi.fn(() => Promise.resolve({ data: rows, error: null }));
  const selectFn = vi.fn(() => ({ in: inFn }));
  const fromFn = vi.fn(() => ({ select: selectFn }));
  return { supabase: { from: fromFn } as any, inFn, selectFn, fromFn };
}

describe('bulkAttributeWebsiteAuto — integration', () => {
  it('calls attribute_website_order once per selected order with the shared payload', async () => {
    const { supabase, fromFn, selectFn, inFn } = makeSupabase([
      { id: 'ord-A', external_id: 'W1' },
      { id: 'ord-B', external_id: 'W2' },
      { id: 'ord-C', external_id: 'W3' },
    ]);
    const attribute = vi.fn().mockResolvedValue(undefined);
    const progress: Array<{ done: number; total: number; failed: number }> = [];

    const res = await bulkAttributeWebsiteAuto({
      supabase,
      attribute,
      externalIds: ['W1', 'W2', 'W3'],
      salesPersonId: 'rep-1',
      reason: 'remote_customer_paid_online',
      onProgress: (p) => progress.push(p),
    });

    expect(fromFn).toHaveBeenCalledWith('orders');
    expect(selectFn).toHaveBeenCalledWith('id, external_id');
    expect(inFn).toHaveBeenCalledWith('external_id', ['W1', 'W2', 'W3']);

    expect(attribute).toHaveBeenCalledTimes(3);
    const orderIds = attribute.mock.calls.map((c) => c[0].orderId).sort();
    expect(orderIds).toEqual(['ord-A', 'ord-B', 'ord-C']);
    for (const call of attribute.mock.calls) {
      expect(call[0].salesPersonId).toBe('rep-1');
      expect(call[0].reason).toBe('remote_customer_paid_online');
      expect(call[0].reasonCustom).toBeNull();
    }
    expect(res).toEqual({ done: 3, failed: 0, attempted: ['W1', 'W2', 'W3'] });
    // Progress reported once per order.
    expect(progress).toHaveLength(3);
    expect(progress.at(-1)).toEqual({ done: 3, total: 3, failed: 0 });
  });

  it('counts unresolved external_ids as failures without invoking attribute', async () => {
    const { supabase } = makeSupabase([{ id: 'ord-A', external_id: 'W1' }]);
    const attribute = vi.fn().mockResolvedValue(undefined);
    const res = await bulkAttributeWebsiteAuto({
      supabase,
      attribute,
      externalIds: ['W1', 'W-missing'],
      salesPersonId: 'rep-1',
      reason: 'remote_customer_paid_online',
    });
    expect(attribute).toHaveBeenCalledTimes(1);
    expect(attribute.mock.calls[0][0].orderId).toBe('ord-A');
    expect(res).toEqual({ done: 1, failed: 1, attempted: ['W1'] });
  });

  it('captures per-row failures from attribute_website_order and continues', async () => {
    const { supabase } = makeSupabase([
      { id: 'ord-A', external_id: 'W1' },
      { id: 'ord-B', external_id: 'W2' },
    ]);
    const attribute = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('locked'));
    const res = await bulkAttributeWebsiteAuto({
      supabase,
      attribute,
      externalIds: ['W1', 'W2'],
      salesPersonId: 'rep-1',
      reason: 'remote_customer_paid_online',
    });
    expect(attribute).toHaveBeenCalledTimes(2);
    expect(res.done).toBe(1);
    expect(res.failed).toBe(1);
  });
});