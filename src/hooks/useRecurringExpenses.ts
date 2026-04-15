import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { addDays, addWeeks, addMonths, addQuarters, addYears, isBefore, isAfter, startOfDay, format } from 'date-fns';

export interface RecurringExpense {
  id: string;
  expense_name: string;
  vendor_name: string | null;
  account_id: string | null;
  subaccount_id: string | null;
  default_amount: number;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date: string | null;
  due_day: number | null;
  notes: string | null;
  is_active: boolean;
  last_paid_date: string | null;
  last_paid_amount: number | null;
  last_linked_transaction_id: string | null;
  next_due_date: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export type RecurringStatus = 'upcoming' | 'due' | 'paid' | 'partially_paid' | 'overdue' | 'skipped' | 'inactive';

export const RECURRING_STATUSES: { value: RecurringStatus; label: string; color: string }[] = [
  { value: 'upcoming', label: 'Upcoming', color: 'bg-blue-100 text-blue-800' },
  { value: 'due', label: 'Due', color: 'bg-amber-100 text-amber-800' },
  { value: 'paid', label: 'Paid', color: 'bg-green-100 text-green-800' },
  { value: 'partially_paid', label: 'Partially Paid', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'overdue', label: 'Overdue', color: 'bg-red-100 text-red-800' },
  { value: 'skipped', label: 'Skipped', color: 'bg-muted text-muted-foreground' },
  { value: 'inactive', label: 'Inactive', color: 'bg-muted text-muted-foreground' },
];

export function computeNextDueDate(expense: RecurringExpense): string | null {
  if (!expense.is_active) return null;
  const today = startOfDay(new Date());
  let base = new Date(expense.last_paid_date || expense.start_date);

  // Advance until we find a future date
  for (let i = 0; i < 100; i++) {
    let next: Date;
    switch (expense.frequency) {
      case 'weekly': next = addWeeks(base, 1); break;
      case 'monthly': next = addMonths(base, 1); break;
      case 'quarterly': next = addQuarters(base, 1); break;
      case 'yearly': next = addYears(base, 1); break;
      default: next = addMonths(base, 1);
    }
    if (expense.due_day && expense.frequency !== 'weekly') {
      const day = Math.min(expense.due_day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate());
      next = new Date(next.getFullYear(), next.getMonth(), day);
    }
    if (expense.end_date && isAfter(next, new Date(expense.end_date))) return null;
    if (!isBefore(next, today) || !expense.last_paid_date) return format(next, 'yyyy-MM-dd');
    base = next;
  }
  return null;
}

export function computeStatus(expense: RecurringExpense): RecurringStatus {
  if (!expense.is_active) return 'inactive';
  const today = startOfDay(new Date());
  const nextDue = expense.next_due_date ? new Date(expense.next_due_date) : null;
  if (!nextDue) return 'inactive';

  const daysDiff = Math.ceil((nextDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (expense.last_paid_date) {
    const lastPaid = new Date(expense.last_paid_date);
    // Check if paid for current cycle
    const prevDue = addMonths(nextDue, -1); // simplified
    if (isAfter(lastPaid, prevDue)) {
      if (expense.last_paid_amount && expense.last_paid_amount < expense.default_amount) return 'partially_paid';
      return 'paid';
    }
  }

  if (daysDiff < 0) return 'overdue';
  if (daysDiff <= 3) return 'due';
  return 'upcoming';
}

export function useRecurringExpenses() {
  const [expenses, setExpenses] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('recurring_expenses').select('*').order('next_due_date', { ascending: true });
    if (error) { console.error(error); toast.error('Failed to load recurring expenses'); }
    else setExpenses((data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const createExpense = useCallback(async (expense: Partial<RecurringExpense>) => {
    const nextDue = computeNextDueDate(expense as RecurringExpense);
    const { error } = await supabase.from('recurring_expenses').insert({ ...expense, next_due_date: nextDue } as any);
    if (error) { toast.error('Failed to create expense'); return false; }
    toast.success('Recurring expense created');
    fetchExpenses();
    return true;
  }, [fetchExpenses]);

  const updateExpense = useCallback(async (id: string, updates: Partial<RecurringExpense>) => {
    const { error } = await supabase.from('recurring_expenses').update(updates as any).eq('id', id);
    if (error) { toast.error('Failed to update'); return; }
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    toast.success('Updated');
  }, []);

  const deleteExpense = useCallback(async (id: string) => {
    const { error } = await supabase.from('recurring_expenses').delete().eq('id', id);
    if (error) { toast.error('Failed to delete'); return; }
    setExpenses(prev => prev.filter(e => e.id !== id));
    toast.success('Deleted');
  }, []);

  const enriched = useMemo(() => expenses.map(e => ({
    ...e,
    computed_status: computeStatus(e),
    variance: e.last_paid_amount != null ? e.last_paid_amount - e.default_amount : null,
  })), [expenses]);

  const alerts = useMemo(() => {
    const overdue = enriched.filter(e => e.computed_status === 'overdue');
    const due = enriched.filter(e => e.computed_status === 'due');
    const variance = enriched.filter(e => e.variance != null && Math.abs(e.variance!) > e.default_amount * 0.1);
    return { overdue, due, variance };
  }, [enriched]);

  return { expenses: enriched, loading, fetchExpenses, createExpense, updateExpense, deleteExpense, alerts };
}
