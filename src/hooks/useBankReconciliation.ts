import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BankTransaction {
  id: string;
  upload_id: string | null;
  transaction_date: string;
  value_date: string | null;
  bank_reference: string | null;
  narration: string | null;
  credit_amount: number;
  debit_amount: number;
  running_balance: number | null;
  transaction_type: string;
  account_id: string | null;
  subaccount_id: string | null;
  status: string;
  internal_reference: string | null;
  notes: string | null;
  matched_entity_type: string | null;
  matched_entity_id: string | null;
  match_confidence: number | null;
  matched_by: string | null;
  matched_at: string | null;
  created_at: string;
}

export interface ReconciliationAccount {
  id: string;
  name: string;
  description: string | null;
  account_type: string;
}

export interface ReconciliationSubaccount {
  id: string;
  account_id: string;
  name: string;
}

export interface ReconciliationRule {
  id: string;
  keyword: string;
  account_id: string;
  subaccount_id: string | null;
  suggested_category: string | null;
  priority: number;
}

export interface ReconciliationUpload {
  id: string;
  file_name: string;
  file_type: string;
  bank_name: string | null;
  upload_status: string;
  parsed_count: number;
  created_at: string;
  uploaded_by_name: string;
}

export type TransactionStatus = 'new' | 'auto_matched' | 'pending_review' | 'reconciled' | 'partially_reconciled' | 'unmatched' | 'ignored' | 'duplicate';

export const TRANSACTION_STATUSES: { value: TransactionStatus; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: 'bg-blue-100 text-blue-800' },
  { value: 'auto_matched', label: 'Auto Matched', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'pending_review', label: 'Pending Review', color: 'bg-amber-100 text-amber-800' },
  { value: 'reconciled', label: 'Reconciled', color: 'bg-green-100 text-green-800' },
  { value: 'partially_reconciled', label: 'Partially Reconciled', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'unmatched', label: 'Unmatched', color: 'bg-red-100 text-red-800' },
  { value: 'ignored', label: 'Ignored', color: 'bg-muted text-muted-foreground' },
  { value: 'duplicate', label: 'Duplicate', color: 'bg-orange-100 text-orange-800' },
];

export function useBankReconciliation() {
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [accounts, setAccounts] = useState<ReconciliationAccount[]>([]);
  const [subaccounts, setSubaccounts] = useState<ReconciliationSubaccount[]>([]);
  const [rules, setRules] = useState<ReconciliationRule[]>([]);
  const [uploads, setUploads] = useState<ReconciliationUpload[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [txRes, accRes, subRes, ruleRes, upRes] = await Promise.all([
        supabase.from('bank_transactions').select('*').order('transaction_date', { ascending: false }).limit(1000),
        supabase.from('reconciliation_accounts').select('*').order('name'),
        supabase.from('reconciliation_subaccounts').select('*').order('name'),
        supabase.from('reconciliation_rules').select('*').order('priority', { ascending: false }),
        supabase.from('bank_reconciliation_uploads').select('*').order('created_at', { ascending: false }),
      ]);
      setTransactions((txRes.data as any[]) || []);
      setAccounts((accRes.data as any[]) || []);
      setSubaccounts((subRes.data as any[]) || []);
      setRules((ruleRes.data as any[]) || []);
      setUploads((upRes.data as any[]) || []);
    } catch (err) {
      console.error('Error fetching reconciliation data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const updateTransaction = useCallback(async (id: string, updates: Partial<BankTransaction>) => {
    const { error } = await supabase.from('bank_transactions').update(updates as any).eq('id', id);
    if (error) { toast.error('Failed to update transaction'); return; }
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    toast.success('Transaction updated');
  }, []);

  const bulkUpdateStatus = useCallback(async (ids: string[], status: TransactionStatus) => {
    const { error } = await supabase.from('bank_transactions').update({ status } as any).in('id', ids);
    if (error) { toast.error('Bulk update failed'); return; }
    setTransactions(prev => prev.map(t => ids.includes(t.id) ? { ...t, status } : t));
    toast.success(`${ids.length} transactions updated`);
  }, []);

  const applyAutoRules = useCallback((txns: BankTransaction[]) => {
    return txns.map(tx => {
      if (tx.account_id) return tx;
      const narration = (tx.narration || '').toLowerCase();
      for (const rule of rules) {
        if (narration.includes(rule.keyword.toLowerCase())) {
          return { ...tx, account_id: rule.account_id, subaccount_id: rule.subaccount_id, status: 'auto_matched' as const };
        }
      }
      return tx;
    });
  }, [rules]);

  const kpis = useMemo(() => {
    const totalCredit = transactions.reduce((s, t) => s + (t.credit_amount || 0), 0);
    const totalDebit = transactions.reduce((s, t) => s + (t.debit_amount || 0), 0);
    const reconciled = transactions.filter(t => t.status === 'reconciled').length;
    const unmatched = transactions.filter(t => t.status === 'unmatched' || t.status === 'new').length;
    const pending = transactions.filter(t => t.status === 'pending_review').length;
    return { totalCredit, totalDebit, netFlow: totalCredit - totalDebit, reconciled, unmatched, pending, total: transactions.length };
  }, [transactions]);

  return { transactions, accounts, subaccounts, rules, uploads, loading, kpis, fetchAll, updateTransaction, bulkUpdateStatus, applyAutoRules, setTransactions };
}
