import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export const EXPENSE_TYPES = [
  { value: 'porter', label: 'Porter' },
  { value: 'courier', label: 'Courier' },
  { value: 'travel', label: 'Travel' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'food', label: 'Food' },
  { value: 'office_article', label: 'Office Article' },
  { value: 'gift', label: 'Gift' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'other', label: 'Other' },
] as const;

export const EXPENSE_STATUSES = [
  { value: 'pending', label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'approved', label: 'Approved', color: 'bg-green-100 text-green-800' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-100 text-red-800' },
  { value: 'reimbursed', label: 'Reimbursed', color: 'bg-blue-100 text-blue-800' },
] as const;

export const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'company_card', label: 'Company Card' },
] as const;

export interface Expense {
  id: string;
  expense_type: string;
  amount: number;
  expense_date: string;
  description: string | null;
  vendor_name: string | null;
  receipt_url: string | null;
  payment_mode: string | null;
  notes: string | null;
  status: string;
  created_by: string;
  created_by_name: string;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  paid_from_petty_cash: number | null;
  amount_paid: number | null;
  payment_notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, profile, role } = useAuth();

  const canApprove = role === 'admin' || role === 'finance';
  const canDelete = role === 'admin';

  const fetchExpenses = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (error) throw error;
      setExpenses((data as Expense[]) || []);
    } catch (error: any) {
      console.error('Error fetching expenses:', error);
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const createExpense = async (expense: Omit<Expense, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'created_by_name' | 'approved_by' | 'approved_by_name' | 'approved_at' | 'status'>) => {
    if (!user || !profile) {
      toast.error('You must be logged in to add expenses');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          ...expense,
          created_by: user.id,
          created_by_name: profile.name,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      toast.success('Expense added successfully');
      fetchExpenses();
      return data as Expense;
    } catch (error: any) {
      console.error('Error creating expense:', error);
      toast.error(error.message || 'Failed to add expense');
      return null;
    }
  };

  const updateExpense = async (id: string, updates: Partial<Expense>) => {
    try {
      const { error } = await supabase
        .from('expenses')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      toast.success('Expense updated successfully');
      fetchExpenses();
      return true;
    } catch (error: any) {
      console.error('Error updating expense:', error);
      toast.error(error.message || 'Failed to update expense');
      return false;
    }
  };

  const approveExpense = async (id: string) => {
    if (!user || !profile || !canApprove) {
      toast.error('You do not have permission to approve expenses');
      return false;
    }

    return updateExpense(id, {
      status: 'approved',
      approved_by: user.id,
      approved_by_name: profile.name,
      approved_at: new Date().toISOString(),
    });
  };

  const rejectExpense = async (id: string) => {
    if (!user || !profile || !canApprove) {
      toast.error('You do not have permission to reject expenses');
      return false;
    }

    return updateExpense(id, {
      status: 'rejected',
      approved_by: user.id,
      approved_by_name: profile.name,
      approved_at: new Date().toISOString(),
    });
  };

  const markReimbursed = async (id: string) => {
    if (!canApprove) {
      toast.error('You do not have permission to mark expenses as reimbursed');
      return false;
    }

    return updateExpense(id, {
      status: 'reimbursed',
    });
  };

  const deleteExpense = async (id: string) => {
    if (!canDelete) {
      toast.error('You do not have permission to delete expenses');
      return false;
    }

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Expense deleted successfully');
      fetchExpenses();
      return true;
    } catch (error: any) {
      console.error('Error deleting expense:', error);
      toast.error(error.message || 'Failed to delete expense');
      return false;
    }
  };

  return {
    expenses,
    loading,
    createExpense,
    updateExpense,
    approveExpense,
    rejectExpense,
    markReimbursed,
    deleteExpense,
    refetch: fetchExpenses,
    canApprove,
    canDelete,
  };
}
