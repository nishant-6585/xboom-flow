import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * Integration-style test for the Leave History "Type = Comp-Off" filter.
 *
 * Verifies that:
 *  1. The hook actually sends `leave_type = 'compoff'` to the backend
 *     when the user picks Comp-Off in the Type dropdown.
 *  2. The rows returned by the query are surfaced as-is, so the table
 *     shows ONLY comp-off entries (no other leave types leak through).
 *  3. `totalCount` reflects the filtered set, which is what drives the
 *     empty-state messaging and pagination in <LeaveHistoryPanel />.
 */

// --- supabase client mock ---------------------------------------------------

type Row = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  status: string;
  reason: string | null;
  applied_by_name: string | null;
  is_hr_applied: boolean;
  created_at: string;
  approver_name: string | null;
  approved_rejected_at: string | null;
  employees: { name: string };
};

const DATASET: Row[] = [
  { id: 'r1', employee_id: 'e1', leave_type: 'compoff', start_date: '2026-06-01', end_date: '2026-06-01', total_days: 1, status: 'approved', reason: null, applied_by_name: null, is_hr_applied: false, created_at: '2026-06-01T00:00:00Z', approver_name: 'HR', approved_rejected_at: '2026-06-01T00:00:00Z', employees: { name: 'Alice' } },
  { id: 'r2', employee_id: 'e2', leave_type: 'compoff', start_date: '2026-06-02', end_date: '2026-06-02', total_days: 1, status: 'approved', reason: null, applied_by_name: null, is_hr_applied: false, created_at: '2026-06-02T00:00:00Z', approver_name: 'HR', approved_rejected_at: '2026-06-02T00:00:00Z', employees: { name: 'Bob' } },
  { id: 'r3', employee_id: 'e3', leave_type: 'EL', start_date: '2026-06-03', end_date: '2026-06-03', total_days: 1, status: 'approved', reason: null, applied_by_name: null, is_hr_applied: false, created_at: '2026-06-03T00:00:00Z', approver_name: 'HR', approved_rejected_at: '2026-06-03T00:00:00Z', employees: { name: 'Carol' } },
  { id: 'r4', employee_id: 'e4', leave_type: 'sick', start_date: '2026-06-04', end_date: '2026-06-04', total_days: 1, status: 'rejected', reason: null, applied_by_name: null, is_hr_applied: false, created_at: '2026-06-04T00:00:00Z', approver_name: 'HR', approved_rejected_at: '2026-06-04T00:00:00Z', employees: { name: 'Dan' } },
];

function buildQuery() {
  const filters: { key: string; op: string; val: any }[] = [];
  const chain: any = {
    _filters: filters,
    select() { return chain; },
    eq(key: string, val: any) { filters.push({ key, op: 'eq', val }); return chain; },
    in(key: string, val: any[]) { filters.push({ key, op: 'in', val }); return chain; },
    lte(key: string, val: any) { filters.push({ key, op: 'lte', val }); return chain; },
    gte(key: string, val: any) { filters.push({ key, op: 'gte', val }); return chain; },
    order() { return chain; },
    range() {
      const rows = applyFilters(DATASET, filters);
      return Promise.resolve({ data: rows, count: rows.length, error: null });
    },
    then(resolve: any) {
      const rows = applyFilters(DATASET, filters);
      return Promise.resolve({ data: rows, count: rows.length, error: null }).then(resolve);
    },
  };
  return chain;
}

function applyFilters(rows: Row[], filters: { key: string; op: string; val: any }[]): Row[] {
  return rows.filter(row => {
    for (const f of filters) {
      const v = (row as any)[f.key];
      if (f.op === 'eq' && v !== f.val) return false;
      if (f.op === 'in' && !(f.val as any[]).includes(v)) return false;
      if (f.op === 'lte' && !(v <= f.val)) return false;
      if (f.op === 'gte' && !(v >= f.val)) return false;
    }
    return true;
  });
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (_table: string) => buildQuery(),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'test' } } }) },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useLeaveHistory, LeaveHistoryFilters } from '@/hooks/useLeaveHistory';

const baseFilters: LeaveHistoryFilters = {
  employeeId: '',
  leaveType: '',
  status: 'all',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  includePending: false,
};

describe('Leave History — Comp-Off type filter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ONLY compoff rows when the Comp-Off type filter is selected', async () => {
    const { result } = renderHook(() => useLeaveHistory());

    await act(async () => {
      await result.current.fetchAll({ ...baseFilters, leaveType: 'compoff' }, 0);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.records.length).toBeGreaterThan(0);
    for (const r of result.current.records) {
      expect(r.leave_type).toBe('compoff');
    }
    // No non-compoff types leak through.
    expect(result.current.records.find(r => r.leave_type !== 'compoff')).toBeUndefined();
    // totalCount drives the pagination + empty-state UX and must match.
    expect(result.current.totalCount).toBe(result.current.records.length);
  });

  it('surfaces zero rows (empty state) for a type with no matches', async () => {
    const { result } = renderHook(() => useLeaveHistory());

    await act(async () => {
      await result.current.fetchAll({ ...baseFilters, leaveType: 'wfh' }, 0);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.records).toHaveLength(0);
    expect(result.current.totalCount).toBe(0);
  });
});