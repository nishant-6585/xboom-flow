import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface LeaveHistoryRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  status: string;
  applied_by_name: string | null;
  is_hr_applied: boolean;
  created_at: string;
  approver_name: string | null;
  approved_rejected_at: string | null;
  comments: string | null;
  ai_reviewed: boolean;
}

export interface LeaveHistoryFilters {
  employeeId: string;
  leaveType: string;
  status: string;
  startDate: string;
  endDate: string;
  includePending: boolean;
}

export interface LeaveHistoryKPIs {
  totalLeaves: number;
  totalDays: number;
  approvedCount: number;
  rejectedCount: number;
  avgDaysPerEmployee: number;
}

export interface EmployeeLeaveSummary {
  employee_id: string;
  employee_name: string;
  el_days: number;
  sick_days: number;
  other_days: number;
  total_count: number;
}

const PAGE_SIZE = 25;

export function useLeaveHistory() {
  const [records, setRecords] = useState<LeaveHistoryRecord[]>([]);
  const [kpis, setKpis] = useState<LeaveHistoryKPIs>({ totalLeaves: 0, totalDays: 0, approvedCount: 0, rejectedCount: 0, avgDaysPerEmployee: 0 });
  const [summaries, setSummaries] = useState<EmployeeLeaveSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);

  const fetchLeaveHistory = useCallback(async (filters: LeaveHistoryFilters, pageNum = 0) => {
    setLoading(true);
    try {
      let query = supabase
        .from('leave_requests')
        .select('*, employees!inner(name)', { count: 'exact' });

      // Status filter
      if (!filters.includePending) {
        if (filters.status === 'approved') {
          query = query.eq('status', 'approved');
        } else if (filters.status === 'rejected') {
          query = query.eq('status', 'rejected');
        } else {
          query = query.in('status', ['approved', 'rejected']);
        }
      } else {
        if (filters.status && filters.status !== 'all') {
          query = query.eq('status', filters.status);
        }
      }

      if (filters.employeeId) {
        query = query.eq('employee_id', filters.employeeId);
      }
      if (filters.leaveType) {
        query = query.eq('leave_type', filters.leaveType);
      }
      // Overlap semantics: include any leave whose period intersects
      // [startDate, endDate]. A leave that starts on/before endDate AND
      // ends on/after startDate overlaps the window.
      if (filters.endDate) {
        query = query.lte('start_date', filters.endDate);
      }
      if (filters.startDate) {
        query = query.gte('end_date', filters.startDate);
      }

      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const mapped: LeaveHistoryRecord[] = (data || []).map((r: any) => ({
        id: r.id,
        employee_id: r.employee_id,
        employee_name: r.employees?.name || '—',
        leave_type: r.leave_type,
        start_date: r.start_date,
        end_date: r.end_date,
        total_days: r.total_days,
        reason: r.reason,
        status: r.status,
        applied_by_name: r.applied_by_name,
        is_hr_applied: r.is_hr_applied,
        created_at: r.created_at,
        approver_name: r.approver_name,
        approved_rejected_at: r.approved_rejected_at,
        comments: r.comments,
        ai_reviewed: Boolean(r.ai_reviewed),
      }));

      setRecords(mapped);
      setTotalCount(count || 0);
      setPage(pageNum);
    } catch (err) {
      console.error('Error fetching leave history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchKPIs = useCallback(async (filters: LeaveHistoryFilters) => {
    try {
      let query = supabase
        .from('leave_requests')
        .select('status, total_days, employee_id, employees!inner(name)');

      if (!filters.includePending) {
        query = query.in('status', ['approved', 'rejected']);
      }
      if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
      if (filters.leaveType) query = query.eq('leave_type', filters.leaveType);
      if (filters.endDate) query = query.lte('start_date', filters.endDate);
      if (filters.startDate) query = query.gte('end_date', filters.startDate);

      const { data, error } = await query;
      if (error) throw error;

      const all = data || [];
      const approved = all.filter((r: any) => r.status === 'approved');
      const rejected = all.filter((r: any) => r.status === 'rejected');
      const uniqueEmployees = new Set(approved.map((r: any) => r.employee_id));

      setKpis({
        totalLeaves: all.length,
        totalDays: approved.reduce((s: number, r: any) => s + (r.total_days || 0), 0),
        approvedCount: approved.length,
        rejectedCount: rejected.length,
        avgDaysPerEmployee: uniqueEmployees.size > 0
          ? Math.round((approved.reduce((s: number, r: any) => s + (r.total_days || 0), 0) / uniqueEmployees.size) * 10) / 10
          : 0,
      });
    } catch (err) {
      console.error('Error fetching KPIs:', err);
    }
  }, []);

  const fetchSummaries = useCallback(async (filters: LeaveHistoryFilters) => {
    try {
      let query = supabase
        .from('leave_requests')
        .select('employee_id, leave_type, total_days, employees!inner(name)')
        .eq('status', 'approved');

      if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
      if (filters.endDate) query = query.lte('start_date', filters.endDate);
      if (filters.startDate) query = query.gte('end_date', filters.startDate);

      const { data, error } = await query;
      if (error) throw error;

      const map = new Map<string, EmployeeLeaveSummary>();
      for (const r of (data || [])) {
        const empId = r.employee_id;
        if (!map.has(empId)) {
          map.set(empId, {
            employee_id: empId,
            employee_name: (r as any).employees?.name || '—',
            el_days: 0,
            sick_days: 0,
            other_days: 0,
            total_count: 0,
          });
        }
        const entry = map.get(empId)!;
        entry.total_count++;
        const days = r.total_days || 0;
        if (r.leave_type === 'EL' || r.leave_type === 'casual' || r.leave_type === 'paid' || r.leave_type === 'half_day_EL' || r.leave_type === 'half_day_casual' || r.leave_type === 'half_day_paid') {
          entry.el_days += days;
        } else if (r.leave_type === 'sick' || r.leave_type === 'half_day_sick') {
          entry.sick_days += days;
        } else {
          entry.other_days += days;
        }
      }

      setSummaries(Array.from(map.values()).sort((a, b) => a.employee_name.localeCompare(b.employee_name)));
    } catch (err) {
      console.error('Error fetching summaries:', err);
    }
  }, []);

  const fetchAll = useCallback(async (filters: LeaveHistoryFilters, pageNum = 0) => {
    await Promise.all([
      fetchLeaveHistory(filters, pageNum),
      fetchKPIs(filters),
      fetchSummaries(filters),
    ]);
  }, [fetchLeaveHistory, fetchKPIs, fetchSummaries]);

  // Fetch all records for export (no pagination)
  const fetchForExport = useCallback(async (filters: LeaveHistoryFilters): Promise<LeaveHistoryRecord[]> => {
    let query = supabase
      .from('leave_requests')
      .select('*, employees!inner(name)');

    if (!filters.includePending) {
      if (filters.status === 'approved') {
        query = query.eq('status', 'approved');
      } else if (filters.status === 'rejected') {
        query = query.eq('status', 'rejected');
      } else {
        query = query.in('status', ['approved', 'rejected']);
      }
    } else {
      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
    }

    if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
    if (filters.leaveType) query = query.eq('leave_type', filters.leaveType);
    if (filters.endDate) query = query.lte('start_date', filters.endDate);
    if (filters.startDate) query = query.gte('end_date', filters.startDate);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    return (data || []).map((r: any) => ({
      id: r.id,
      employee_id: r.employee_id,
      employee_name: r.employees?.name || '—',
      leave_type: r.leave_type,
      start_date: r.start_date,
      end_date: r.end_date,
      total_days: r.total_days,
      reason: r.reason,
      status: r.status,
      applied_by_name: r.applied_by_name,
      is_hr_applied: r.is_hr_applied,
      created_at: r.created_at,
      approver_name: r.approver_name,
      approved_rejected_at: r.approved_rejected_at,
      comments: r.comments,
      ai_reviewed: Boolean(r.ai_reviewed),
    }));
  }, []);

  // Delete a leave entry. If it was approved and the leave_type is balance-tracked,
  // refund the balance and record a credit transaction.
  const deleteLeaveEntry = useCallback(async (leaveId: string, reason?: string): Promise<boolean> => {
    try {
      // Fetch the entry first so we know whether to refund balance
      const { data: leave, error: fetchErr } = await supabase
        .from('leave_requests')
        .select('id, employee_id, leave_type, total_days, status')
        .eq('id', leaveId)
        .single();
      if (fetchErr) throw fetchErr;
      if (!leave) throw new Error('Leave entry not found');

      const { data: { user } } = await supabase.auth.getUser();

      // Refund balance only if the leave was approved and is balance-tracked
      const balanceTypeMap: Record<string, string> = {
        EL: 'EL', half_day_EL: 'EL',
        casual: 'EL', half_day_casual: 'EL',
        paid: 'EL', half_day_paid: 'EL',
        sick: 'sick', half_day_sick: 'sick',
      };
      const balanceType = balanceTypeMap[leave.leave_type];
      const days = leave.total_days || 0;

      if (leave.status === 'approved' && balanceType && days > 0) {
        const year = new Date().getFullYear();
        const { data: existing } = await supabase
          .from('leave_balances')
          .select('balance')
          .eq('employee_id', leave.employee_id)
          .eq('leave_type', balanceType)
          .eq('year', year)
          .maybeSingle();

        const oldBalance = existing?.balance ?? 0;
        const newBalance = oldBalance + days;

        await supabase
          .from('leave_balances')
          .upsert({
            employee_id: leave.employee_id,
            leave_type: balanceType,
            year,
            balance: newBalance,
          }, { onConflict: 'employee_id,leave_type,year' });

        await supabase
          .from('leave_transactions')
          .insert({
            employee_id: leave.employee_id,
            leave_type: balanceType,
            transaction_type: 'credit',
            amount: days,
            balance_after: newBalance,
            credit_date: new Date().toISOString().split('T')[0],
            remarks: `Leave entry deleted (${leave.leave_type}, ${days} days)${reason ? `: ${reason}` : ''}`,
            created_by: user?.id ?? 'system',
          });
      }

      const { error: delErr } = await supabase
        .from('leave_requests')
        .delete()
        .eq('id', leaveId);
      if (delErr) throw delErr;

      // Optimistically remove from local state
      setRecords(prev => prev.filter(r => r.id !== leaveId));
      setTotalCount(c => Math.max(0, c - 1));

      toast.success('Leave entry deleted' + (leave.status === 'approved' && balanceType && days > 0 ? ' and balance refunded' : ''));
      return true;
    } catch (err: any) {
      console.error('Error deleting leave entry:', err);
      toast.error(err.message || 'Failed to delete leave entry');
      return false;
    }
  }, []);

  return {
    records, kpis, summaries, loading, totalCount, page,
    fetchAll, fetchLeaveHistory, setPage, fetchForExport, deleteLeaveEntry,
    pageSize: PAGE_SIZE,
  };
}
