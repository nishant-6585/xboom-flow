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
  unpaid: 'Unpaid Leave',
  wfh: 'Work from Home',
};

export interface EmployeeLeaveRow {
  employee_id: string;
  employee_name: string;
  balances: { leave_type: string; label: string; balance: number; id: string }[];
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

    const deprecated = new Set(['casual', 'half_day_casual', 'paid', 'half_day_paid']);
    const summaries: LeaveBalanceSummary[] = [];

    leaveTypes.forEach(lt => {
      if (deprecated.has(lt)) return;
      const bal = balanceData.find(b => b.leave_type === lt);
      const credits = yearTx
        .filter(tx => tx.leave_type === lt && tx.transaction_type === 'credit')
        .reduce((sum, tx) => sum + tx.amount, 0);
      const debits = yearTx
        .filter(tx => tx.leave_type === lt && tx.transaction_type === 'debit')
        .reduce((sum, tx) => sum + tx.amount, 0);

      summaries.push({
        leave_type: lt,
        label: LEAVE_TYPE_LABELS[lt] || lt,
        balance: bal?.balance ?? 0,
        total_credited: credits,
        total_used: debits,
      });
    });

    ['EL', 'paid', 'sick'].forEach(lt => {
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
    const { data } = await supabase
      .from('leave_balances')
      .select('*, employees!inner(name)')
      .eq('year', year)
      .order('employee_id');

    const raw = (data || []).map((item: any) => ({
      ...item,
      employee_name: item.employees?.name,
    }));
    setAllBalances(raw);

    // Group by employee for the management view
    const grouped = new Map<string, EmployeeLeaveRow>();
    const deprecated = new Set(['casual', 'half_day_casual']);
    for (const b of raw) {
      if (deprecated.has(b.leave_type)) continue;
      if (!grouped.has(b.employee_id)) {
        grouped.set(b.employee_id, {
          employee_id: b.employee_id,
          employee_name: b.employee_name || '—',
          balances: [],
        });
      }
      grouped.get(b.employee_id)!.balances.push({
        leave_type: b.leave_type,
        label: LEAVE_TYPE_LABELS[b.leave_type] || b.leave_type,
        balance: b.balance,
        id: b.id,
      });
    }

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
