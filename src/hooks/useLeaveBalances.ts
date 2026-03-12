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

export function useLeaveBalances(employeeId?: string) {
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
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
    setBalances((data as LeaveBalance[]) || []);
  }, [employeeId]);

  const fetchTransactions = useCallback(async () => {
    if (!employeeId) return;
    const { data } = await supabase
      .from('leave_transactions')
      .select('*')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .limit(50);
    setTransactions((data as LeaveTransaction[]) || []);
  }, [employeeId]);

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
    Promise.all([fetchBalances(), fetchTransactions()]).finally(() => setLoading(false));
  }, [fetchBalances, fetchTransactions]);

  return { balances, transactions, allBalances, loading, fetchBalances, fetchTransactions, fetchAllBalances };
}
