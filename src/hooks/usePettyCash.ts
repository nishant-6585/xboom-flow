import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface PettyCashTransaction {
  id: string;
  user_id: string;
  user_name: string;
  transaction_type: 'cash_given' | 'expense_deduction' | 'overpayment_credit' | 'refund';
  amount: number;
  expense_id: string | null;
  notes: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
}

export interface UserPettyCashBalance {
  user_id: string;
  user_name: string;
  balance: number;
}

export function usePettyCash() {
  const [transactions, setTransactions] = useState<PettyCashTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, profile, role } = useAuth();

  const canManage = role === 'admin' || role === 'finance';

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('petty_cash_transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions((data as PettyCashTransaction[]) || []);
    } catch (error: any) {
      console.error('Error fetching petty cash transactions:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Calculate balance for a specific user
  const getUserBalance = (userId: string): number => {
    return transactions
      .filter(t => t.user_id === userId)
      .reduce((balance, t) => {
        if (t.transaction_type === 'cash_given' || t.transaction_type === 'overpayment_credit') {
          return balance + t.amount;
        } else if (t.transaction_type === 'expense_deduction' || t.transaction_type === 'refund') {
          return balance - t.amount;
        }
        return balance;
      }, 0);
  };

  // Get all users with petty cash balances
  const getAllUserBalances = (): UserPettyCashBalance[] => {
    const userMap = new Map<string, { name: string; balance: number }>();

    transactions.forEach(t => {
      const current = userMap.get(t.user_id) || { name: t.user_name, balance: 0 };
      
      if (t.transaction_type === 'cash_given' || t.transaction_type === 'overpayment_credit') {
        current.balance += t.amount;
      } else if (t.transaction_type === 'expense_deduction' || t.transaction_type === 'refund') {
        current.balance -= t.amount;
      }
      
      userMap.set(t.user_id, current);
    });

    return Array.from(userMap.entries())
      .map(([user_id, data]) => ({
        user_id,
        user_name: data.name,
        balance: data.balance,
      }))
      .filter(u => u.balance !== 0)
      .sort((a, b) => b.balance - a.balance);
  };

  // Give petty cash to a user (admin/finance only)
  const givePettyCash = async (targetUserId: string, targetUserName: string, amount: number, notes?: string) => {
    if (!user || !profile || !canManage) {
      toast.error('You do not have permission to give petty cash');
      return false;
    }

    try {
      const { error } = await supabase
        .from('petty_cash_transactions')
        .insert({
          user_id: targetUserId,
          user_name: targetUserName,
          transaction_type: 'cash_given',
          amount,
          notes: notes || null,
          created_by: user.id,
          created_by_name: profile.name,
        });

      if (error) throw error;
      toast.success(`₹${amount.toLocaleString()} petty cash given to ${targetUserName}`);
      fetchTransactions();
      return true;
    } catch (error: any) {
      console.error('Error giving petty cash:', error);
      toast.error(error.message || 'Failed to give petty cash');
      return false;
    }
  };

  // Record petty cash received (any user can record for themselves)
  const recordReceivedCash = async (amount: number, notes?: string) => {
    if (!user || !profile) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      const { error } = await supabase
        .from('petty_cash_transactions')
        .insert({
          user_id: user.id,
          user_name: profile.name,
          transaction_type: 'cash_given',
          amount,
          notes: notes || 'Petty cash received',
          created_by: user.id,
          created_by_name: profile.name,
        });

      if (error) throw error;
      toast.success(`₹${amount.toLocaleString()} petty cash recorded`);
      fetchTransactions();
      return true;
    } catch (error: any) {
      console.error('Error recording petty cash:', error);
      toast.error(error.message || 'Failed to record petty cash');
      return false;
    }
  };

  // Deduct from petty cash for an expense
  const deductForExpense = async (expenseId: string, amount: number, notes?: string) => {
    if (!user || !profile) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      const { error } = await supabase
        .from('petty_cash_transactions')
        .insert({
          user_id: user.id,
          user_name: profile.name,
          transaction_type: 'expense_deduction',
          amount,
          expense_id: expenseId,
          notes: notes || 'Used for expense',
          created_by: user.id,
          created_by_name: profile.name,
        });

      if (error) throw error;
      fetchTransactions();
      return true;
    } catch (error: any) {
      console.error('Error deducting petty cash:', error);
      toast.error(error.message || 'Failed to deduct petty cash');
      return false;
    }
  };

  // Credit overpayment to user's petty cash
  const creditOverpayment = async (targetUserId: string, targetUserName: string, amount: number, expenseId: string) => {
    if (!user || !profile || !canManage) {
      toast.error('You do not have permission');
      return false;
    }

    try {
      const { error } = await supabase
        .from('petty_cash_transactions')
        .insert({
          user_id: targetUserId,
          user_name: targetUserName,
          transaction_type: 'overpayment_credit',
          amount,
          expense_id: expenseId,
          notes: 'Overpayment credited to petty cash',
          created_by: user.id,
          created_by_name: profile.name,
        });

      if (error) throw error;
      fetchTransactions();
      return true;
    } catch (error: any) {
      console.error('Error crediting overpayment:', error);
      return false;
    }
  };

  // Get my current balance
  const myBalance = user ? getUserBalance(user.id) : 0;

  return {
    transactions,
    loading,
    getUserBalance,
    getAllUserBalances,
    givePettyCash,
    recordReceivedCash,
    deductForExpense,
    creditOverpayment,
    refetch: fetchTransactions,
    canManage,
    myBalance,
  };
}
