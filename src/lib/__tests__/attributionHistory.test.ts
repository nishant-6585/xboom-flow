import { describe, it, expect } from 'vitest';
import { dedupeAttributionHistory, originOf } from '@/lib/attributionHistory';

const base = {
  order_id: 'o1',
  from_sales_person_id: null,
  to_sales_person_id: 'u1',
  to_sales_person_name: 'Srishti Suman',
  reason: 'other',
  reason_custom: 'Customer preferred to order online',
  changed_by: 'admin1',
  changed_by_name: 'Amit Kumar',
  evidence: [],
} as any;

describe('attribution history de-duplication', () => {
  it('collapses the same event written by both paths', () => {
    const rows = [
      { ...base, id: 'a', source: 'approved_request', created_at: '2026-07-30T10:24:15.000Z' },
      { ...base, id: 'b', source: 'approved_request', created_at: '2026-07-30T10:24:17.000Z' },
    ];
    expect(dedupeAttributionHistory(rows)).toHaveLength(1);
  });

  it('drops repeated row ids', () => {
    const row = { ...base, id: 'a', source: 'direct', created_at: '2026-07-30T10:24:15.000Z' };
    expect(dedupeAttributionHistory([row, row, row])).toHaveLength(1);
  });

  it('keeps genuinely distinct events, newest first', () => {
    const rows = [
      { ...base, id: 'a', source: 'direct', created_at: '2026-07-01T10:00:00.000Z' },
      { ...base, id: 'b', to_sales_person_id: 'u2', source: 'approved_request', created_at: '2026-07-30T10:00:00.000Z' },
    ];
    const out = dedupeAttributionHistory(rows);
    expect(out.map((r) => r.id)).toEqual(['b', 'a']);
    expect(out[0].origin).toBe('audit');
    expect(out[1].origin).toBe('history');
  });

  it('labels origin from the write source', () => {
    expect(originOf({ source: 'approved_request' } as any)).toBe('audit');
    expect(originOf({ source: 'direct' } as any)).toBe('history');
  });

  it('handles empty input', () => {
    expect(dedupeAttributionHistory(null)).toEqual([]);
  });
});
