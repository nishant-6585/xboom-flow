import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface CreditCard {
  id: string;
  card_name: string;
  bank_name: string;
  credit_limit: number;
  billing_cycle_start_date: number;
  due_days_after_statement: number;
  is_active: boolean;
  created_at: string;
}

export interface CCStatement {
  id: string;
  card_id: string;
  billing_month: string;
  outstanding_balance: number;
  total_due: number;
  minimum_due: number;
  due_date: string;
  available_credit_limit: number;
  interest_charged: number;
}

export interface CCTransaction {
  id: string;
  card_id: string;
  transaction_date: string;
  amount: number;
  category: string;
  description: string | null;
  department: string | null;
  campaign_id: string | null;
}

export interface CCPayment {
  id: string;
  card_id: string;
  billing_month: string;
  amount_paid: number;
  payment_date: string;
  payment_type: string;
  notes: string | null;
}

export function useCreditCards() {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [statements, setStatements] = useState<CCStatement[]>([]);
  const [transactions, setTransactions] = useState<CCTransaction[]>([]);
  const [payments, setPayments] = useState<CCPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cardsRes, stmtRes, txnRes, payRes] = await Promise.all([
        supabase.from('credit_cards').select('*').order('card_name'),
        supabase.from('cc_monthly_statements').select('*').order('due_date', { ascending: false }),
        supabase.from('cc_transactions').select('*').order('transaction_date', { ascending: false }),
        supabase.from('cc_payments').select('*').order('payment_date', { ascending: false }),
      ]);
      setCards((cardsRes.data as any[]) || []);
      setStatements((stmtRes.data as any[]) || []);
      setTransactions((txnRes.data as any[]) || []);
      setPayments((payRes.data as any[]) || []);
    } catch (e) {
      console.error('Error fetching credit card data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addCard = async (data: Omit<CreditCard, 'id' | 'created_at' | 'is_active'>) => {
    const { error } = await supabase.from('credit_cards').insert(data as any);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return false; }
    toast({ title: 'Card added' });
    fetchAll();
    return true;
  };

  const addStatement = async (data: Omit<CCStatement, 'id'>) => {
    const { error } = await supabase.from('cc_monthly_statements').insert(data as any);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return false; }
    toast({ title: 'Statement added' });
    fetchAll();
    return true;
  };

  const addTransaction = async (data: Omit<CCTransaction, 'id'>) => {
    const { error } = await supabase.from('cc_transactions').insert(data as any);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return false; }
    toast({ title: 'Transaction recorded' });
    fetchAll();
    return true;
  };

  const addPayment = async (data: Omit<CCPayment, 'id'>) => {
    const { error } = await supabase.from('cc_payments').insert(data as any);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return false; }
    toast({ title: 'Payment recorded' });
    fetchAll();
    return true;
  };

  // Computed metrics
  const getCardMetrics = (cardId: string) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return null;
    const latestStatement = statements.filter(s => s.card_id === cardId)[0];
    const monthPayments = latestStatement
      ? payments.filter(p => p.card_id === cardId && p.billing_month === latestStatement.billing_month)
      : [];
    const totalPaid = monthPayments.reduce((sum, p) => sum + p.amount_paid, 0);

    const utilization = latestStatement
      ? (latestStatement.outstanding_balance / card.credit_limit) * 100
      : 0;

    let riskLevel: 'SAFE' | 'WARNING' | 'HIGH RISK' | 'CRITICAL' = 'SAFE';
    if (utilization >= 90) riskLevel = 'CRITICAL';
    else if (utilization >= 80) riskLevel = 'HIGH RISK';
    else if (utilization >= 60) riskLevel = 'WARNING';

    let paymentStatus: 'FULLY PAID' | 'SAFE' | 'DANGER' | 'N/A' = 'N/A';
    if (latestStatement) {
      if (totalPaid >= latestStatement.total_due) paymentStatus = 'FULLY PAID';
      else if (totalPaid >= latestStatement.minimum_due) paymentStatus = 'SAFE';
      else paymentStatus = 'DANGER';
    }

    const interestApplicable = latestStatement && totalPaid < latestStatement.total_due;

    const dueDate = latestStatement ? new Date(latestStatement.due_date) : null;
    const today = new Date();
    const delayDays = dueDate && monthPayments.length > 0
      ? Math.max(0, Math.floor((new Date(monthPayments[0].payment_date).getTime() - dueDate.getTime()) / 86400000))
      : null;
    const daysUntilDue = dueDate ? Math.floor((dueDate.getTime() - today.getTime()) / 86400000) : null;

    return {
      card,
      latestStatement,
      utilization: Math.round(utilization * 10) / 10,
      riskLevel,
      paymentStatus,
      interestApplicable,
      totalPaid,
      delayDays,
      daysUntilDue,
    };
  };

  const summaryMetrics = () => {
    const totalOutstanding = statements.reduce((sum, s) => {
      const isLatest = !statements.find(
        s2 => s2.card_id === s.card_id && s2.due_date > s.due_date
      );
      return isLatest ? sum + s.outstanding_balance : sum;
    }, 0);

    const totalCreditLimit = cards.filter(c => c.is_active).reduce((sum, c) => sum + c.credit_limit, 0);
    const avgUtilization = totalCreditLimit > 0 ? (totalOutstanding / totalCreditLimit) * 100 : 0;
    const totalInterest = statements.reduce((sum, s) => sum + s.interest_charged, 0);
    const riskyCards = cards.filter(c => {
      const m = getCardMetrics(c.id);
      return m && (m.riskLevel === 'HIGH RISK' || m.riskLevel === 'CRITICAL');
    }).length;

    return {
      totalOutstanding,
      totalCreditLimit,
      avgUtilization: Math.round(avgUtilization * 10) / 10,
      totalInterest,
      riskyCards,
    };
  };

  return {
    cards, statements, transactions, payments, loading,
    addCard, addStatement, addTransaction, addPayment,
    getCardMetrics, summaryMetrics, refetch: fetchAll,
  };
}
