import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  paid: 'Paid Leave',
  sick: 'Sick Leave',
  unpaid: 'Unpaid Leave',
  wfh: 'Work from Home',
};

export function useLeaveBalances(employeeId?: string) {
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [balanceSummaries, setBalanceSummaries] = useState<LeaveBalanceSummary[]>([]);
  const [transactions, setTransactions] = useState<LeaveTransaction[]>([]);
  const [allBalances, setAllBalances] = useState<(LeaveBalance & { employee_name?: string })[]>([]);
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

    // Collect all leave types from balances and transactions
    const leaveTypes = new Set<string>();
    balanceData.forEach(b => leaveTypes.add(b.leave_type));
    yearTx.forEach(tx => leaveTypes.add(tx.leave_type));

    // Filter out deprecated types
    const deprecated = new Set(['casual', 'half_day_casual']);
    
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

    // Ensure at least EL, paid, sick show up
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

    // Sort: EL first, then paid, sick, rest
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
    
    const mapped = (data || []).map((item: any) => ({
      ...item,
      employee_name: item.employees?.name,
    }));
    setAllBalances(mapped);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchBalances(), fetchTransactions()]).then(([balanceData, txData]) => {
      if (balanceData && txData) {
        computeSummaries(balanceData, txData);
      }
    }).finally(() => setLoading(false));
  }, [fetchBalances, fetchTransactions, computeSummaries]);

  return { balances, balanceSummaries, transactions, allBalances, loading, fetchBalances, fetchTransactions, fetchAllBalances };
}
