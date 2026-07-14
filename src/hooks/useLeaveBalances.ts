import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface LeaveBalance {
  id: string;
  employee_id: string;
  leave_type: string;
  balance: number;
  year: number;
  updated_at: string;
}

export interface LeaveTransaction {
  id: string;
  employee_id: string;
  leave_type: string;
  transaction_type: string;
  amount: number;
  balance_after: number;
  credit_date: string;
  credit_month: number | null;
  credit_year: number | null;
  remarks: string | null;
  created_by: string;
  created_at: string;
}

export interface LeaveBalanceSummary {
  leave_type: string;
  label: string;
  balance: number;
  total_credited: number;
  total_used: number;
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  EL: 'Earned Leave',
  paid: 'Earned Leave',
  sick: 'Sick Leave',
};

export interface EmployeeLeaveRow {
  employee_id: string;
  employee_name: string;
  balances: { leave_type: string; label: string; balance: number; id: string }[];
  last_leave?: {
    applied_on: string | null;
    approved_on: string | null;
    approver_name: string | null;
    leave_type: string | null;
    status: string | null;
  };
}

export function useLeaveBalances(employeeId?: string) {
  const { user, profile } = useAuth();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [balanceSummaries, setBalanceSummaries] = useState<LeaveBalanceSummary[]>([]);
  const [transactions, setTransactions] = useState<LeaveTransaction[]>([]);
  const [allBalances, setAllBalances] = useState<(LeaveBalance & { employee_name?: string })[]>([]);
  const [employeeRows, setEmployeeRows] = useState<EmployeeLeaveRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBalances = useCallback(async () => {
    if (!employeeId) return;
    const year = new Date().getFullYear();
    const { data } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('year', year);
    const balanceData = (data as LeaveBalance[]) || [];
    setBalances(balanceData);
    return balanceData;
  }, [employeeId]);

  const fetchTransactions = useCallback(async () => {
    if (!employeeId) return;
    const { data } = await supabase
      .from('leave_transactions')
      .select('*')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .limit(50);
    const txData = (data as LeaveTransaction[]) || [];
    setTransactions(txData);
    return txData;
  }, [employeeId]);

  const computeSummaries = useCallback((balanceData: LeaveBalance[], txData: LeaveTransaction[]) => {
    const year = new Date().getFullYear();
    const yearTx = txData.filter(tx => {
      const txDate = new Date(tx.created_at);
      return txDate.getFullYear() === year;
    });

    const leaveTypes = new Set<string>();
    balanceData.forEach(b => leaveTypes.add(b.leave_type));
    yearTx.forEach(tx => leaveTypes.add(tx.leave_type));

    const deprecated = new Set(['casual', 'half_day_casual', 'paid', 'half_day_paid', 'unpaid', 'half_day_unpaid', 'wfh']);
    const summaries: LeaveBalanceSummary[] = [];

    leaveTypes.forEach(lt => {
      if (deprecated.has(lt)) return;
      const bal = balanceData.find(b => b.leave_type === lt);
      const isRefund = (remarks: string | null) => {
        const r = (remarks || '').toLowerCase();
        return (
          r.includes('refund') ||
          r.includes('reject') ||
          r.includes('reversal') ||
          r.includes('reversed') ||
          r.includes('cancel') ||
          r.includes('came to office') ||
          r.includes('add back') ||
          r.includes('added back')
        );
      };
      const typeTx = yearTx.filter(tx => tx.leave_type === lt);
      const grantedCredits = typeTx
        .filter(tx => tx.transaction_type === 'credit' && !isRefund(tx.remarks))
        .reduce((sum, tx) => sum + tx.amount, 0);
      const refundCredits = typeTx
        .filter(tx => tx.transaction_type === 'credit' && isRefund(tx.remarks))
        .reduce((sum, tx) => sum + tx.amount, 0);
      const rawDebits = typeTx
        .filter(tx => tx.transaction_type === 'debit')
        .reduce((sum, tx) => sum + tx.amount, 0);
      // Net used = actual debits minus refunds that reversed those debits
      const credits = grantedCredits;
      const debits = Math.max(0, rawDebits - refundCredits);

      summaries.push({
        leave_type: lt,
        label: LEAVE_TYPE_LABELS[lt] || lt,
        balance: bal?.balance ?? 0,
        total_credited: credits,
        total_used: debits,
      });
    });

    ['EL', 'sick'].forEach(lt => {
      if (!summaries.find(s => s.leave_type === lt)) {
        summaries.push({
          leave_type: lt,
          label: LEAVE_TYPE_LABELS[lt] || lt,
          balance: 0,
          total_credited: 0,
          total_used: 0,
        });
      }
    });

    const order = ['EL', 'paid', 'sick', 'unpaid', 'wfh'];
    summaries.sort((a, b) => {
      const ai = order.indexOf(a.leave_type);
      const bi = order.indexOf(b.leave_type);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    setBalanceSummaries(summaries);
  }, []);

  const fetchAllBalances = useCallback(async () => {
    const year = new Date().getFullYear();

    // Fetch ALL active employees first
    const { data: employees } = await supabase
      .from('employees')
      .select('id, name')
      .eq('is_active', true)
      .eq('employment_status', 'active')
      .order('name');

    // Fetch leave balances for current year
    const { data: balanceData } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('year', year);

    const balancesByEmployee = new Map<string, any[]>();
    for (const b of (balanceData || [])) {
      if (!balancesByEmployee.has(b.employee_id)) {
        balancesByEmployee.set(b.employee_id, []);
      }
      balancesByEmployee.get(b.employee_id)!.push(b);
    }

    // Fetch latest leave request per employee (most recent by created_at)
    const empIds = (employees || []).map((e: any) => e.id);
    const { data: leaveReqs } = await supabase
      .from('leave_requests')
      .select('employee_id, leave_type, status, created_at, approved_at, rejected_at, approved_by, rejected_by')
      .in('employee_id', empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000'])
      .order('created_at', { ascending: false });

    const latestByEmp = new Map<string, any>();
    for (const lr of (leaveReqs || [])) {
      if (!latestByEmp.has(lr.employee_id)) latestByEmp.set(lr.employee_id, lr);
    }

    // Resolve approver names
    const approverIds = Array.from(
      new Set(
        Array.from(latestByEmp.values())
          .map((lr: any) => lr.approved_by || lr.rejected_by)
          .filter(Boolean),
      ),
    );
    const approverNameById = new Map<string, string>();
    if (approverIds.length) {
      const { data: approvers } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', approverIds);
      for (const a of (approvers || [])) {
        approverNameById.set(a.id, a.name || '—');
      }
    }

    // Build rows for ALL active employees
    const grouped = new Map<string, EmployeeLeaveRow>();
    const deprecated = new Set(['casual', 'half_day_casual']);

    for (const emp of (employees || [])) {
      const lr = latestByEmp.get(emp.id);
      const approverId = lr?.approved_by || lr?.rejected_by || null;
      grouped.set(emp.id, {
        employee_id: emp.id,
        employee_name: emp.name || '—',
        balances: [],
        last_leave: lr ? {
          applied_on: lr.created_at,
          approved_on: lr.approved_at || lr.rejected_at || null,
          approver_name: approverId ? (approverNameById.get(approverId) || '—') : null,
          leave_type: lr.leave_type,
          status: lr.status,
        } : undefined,
      });

      const empBalances = balancesByEmployee.get(emp.id) || [];
      for (const b of empBalances) {
        if (deprecated.has(b.leave_type)) continue;
        grouped.get(emp.id)!.balances.push({
          leave_type: b.leave_type,
          label: LEAVE_TYPE_LABELS[b.leave_type] || b.leave_type,
          balance: b.balance,
          id: b.id,
        });
      }
    }

    // Also set allBalances for backward compat
    const raw = (balanceData || [])
      .filter((b: any) => {
        const emp = (employees || []).find((e: any) => e.id === b.employee_id);
        return !!emp;
      })
      .map((item: any) => {
        const emp = (employees || []).find((e: any) => e.id === item.employee_id);
        return { ...item, employee_name: emp?.name };
      });
    setAllBalances(raw);

    // Sort balances within each employee
    const order = ['EL', 'paid', 'sick', 'unpaid', 'wfh'];
    grouped.forEach(row => {
      row.balances.sort((a, b) => {
        const ai = order.indexOf(a.leave_type);
        const bi = order.indexOf(b.leave_type);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
    });

    setEmployeeRows(Array.from(grouped.values()).sort((a, b) => a.employee_name.localeCompare(b.employee_name)));
  }, []);

  const adjustBalances = useCallback(async (
    targetEmployeeId: string,
    adjustments: { leave_type: string; new_balance: number }[],
    reason: string,
  ) => {
    if (!user || !profile) throw new Error('Not authenticated');
    const year = new Date().getFullYear();

    for (const adj of adjustments) {
      // Get current balance
      const { data: existing } = await supabase
        .from('leave_balances')
        .select('balance')
        .eq('employee_id', targetEmployeeId)
        .eq('leave_type', adj.leave_type)
        .eq('year', year)
        .maybeSingle();

      const oldBalance = existing?.balance ?? 0;
      const diff = adj.new_balance - oldBalance;
      if (diff === 0) continue;

      // Upsert balance
      const { error: balErr } = await supabase
        .from('leave_balances')
        .upsert({
          employee_id: targetEmployeeId,
          leave_type: adj.leave_type,
          year,
          balance: adj.new_balance,
        }, { onConflict: 'employee_id,leave_type,year' });

      if (balErr) throw balErr;

      // Record transaction for audit
      const { error: txErr } = await supabase
        .from('leave_transactions')
        .insert({
          employee_id: targetEmployeeId,
          leave_type: adj.leave_type,
          transaction_type: diff > 0 ? 'credit' : 'debit',
          amount: Math.abs(diff),
          balance_after: adj.new_balance,
          credit_date: new Date().toISOString().split('T')[0],
          remarks: `HR Adjustment: ${reason} (${oldBalance} → ${adj.new_balance})`,
          created_by: user.id,
        });

      if (txErr) throw txErr;
    }

    toast.success('Leave balances updated successfully');
    // Refresh data
    await fetchAllBalances();
    if (targetEmployeeId === employeeId) {
      const [bd, td] = await Promise.all([fetchBalances(), fetchTransactions()]);
      if (bd && td) computeSummaries(bd, td);
    }
  }, [user, profile, employeeId, fetchAllBalances, fetchBalances, fetchTransactions, computeSummaries]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchBalances(), fetchTransactions()]).then(([balanceData, txData]) => {
      if (balanceData && txData) {
        computeSummaries(balanceData, txData);
      }
    }).finally(() => setLoading(false));
  }, [fetchBalances, fetchTransactions, computeSummaries]);

  return { balances, balanceSummaries, transactions, allBalances, employeeRows, loading, fetchBalances, fetchTransactions, fetchAllBalances, adjustBalances };
}
