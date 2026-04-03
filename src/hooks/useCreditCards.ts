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
  last_statement_due: number;
  amount_paid: number;
  payment_date: string | null;
  payment_status: string;
  late_fee: number;
  notes: string | null;
}

export function useCreditCards() {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [statements, setStatements] = useState<CCStatement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cardsRes, stmtRes] = await Promise.all([
        supabase.from('credit_cards').select('*').order('card_name'),
        supabase.from('cc_monthly_statements').select('*').order('due_date', { ascending: false }),
      ]);
      setCards((cardsRes.data as any[]) || []);
      setStatements((stmtRes.data as any[]) || []);
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
    // Auto-calculate payment_status
    const paymentStatus = getPaymentStatus(data.amount_paid, data.total_due, data.minimum_due);
    const { error } = await supabase.from('cc_monthly_statements').insert({ ...data, payment_status: paymentStatus } as any);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return false; }
    toast({ title: 'Statement added' });
    fetchAll();
    return true;
  };

  const updateStatement = async (id: string, data: Partial<CCStatement>) => {
    if (data.amount_paid !== undefined && data.total_due !== undefined && data.minimum_due !== undefined) {
      data.payment_status = getPaymentStatus(data.amount_paid, data.total_due, data.minimum_due);
    }
    const { error } = await supabase.from('cc_monthly_statements').update(data as any).eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return false; }
    toast({ title: 'Statement updated' });
    fetchAll();
    return true;
  };

  const getPaymentStatus = (amountPaid: number, totalDue: number, minimumDue: number): string => {
    if (amountPaid >= totalDue && totalDue > 0) return 'FULL';
    if (amountPaid >= minimumDue && minimumDue > 0) return 'PARTIAL';
    return 'UNPAID';
  };

  const getCardMetrics = (cardId: string) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return null;
    const latestStatement = statements.filter(s => s.card_id === cardId)[0];
    if (!latestStatement) return { card, latestStatement: null, utilization: 0, riskLevel: 'SAFE' as const, paymentStatus: 'N/A', daysUntilDue: null, interestApplicable: false, totalPaid: 0, delayDays: null };

    const creditLimit = latestStatement.outstanding_balance + latestStatement.available_credit_limit || card.credit_limit;
    const utilization = creditLimit > 0 ? (latestStatement.outstanding_balance / creditLimit) * 100 : 0;

    const dueDate = new Date(latestStatement.due_date);
    const today = new Date();
    const daysUntilDue = Math.floor((dueDate.getTime() - today.getTime()) / 86400000);
    const isOverdue = daysUntilDue < 0 && latestStatement.payment_status !== 'FULL';

    let riskLevel: 'SAFE' | 'HIGH' | 'CRITICAL' = 'SAFE';
    if (utilization > 90 || isOverdue) riskLevel = 'CRITICAL';
    else if (utilization > 80 || latestStatement.payment_status === 'UNPAID') riskLevel = 'HIGH';

    const interestApplicable = latestStatement.interest_charged > 0;

    return {
      card,
      latestStatement,
      utilization: Math.round(utilization * 10) / 10,
      riskLevel,
      paymentStatus: latestStatement.payment_status || 'UNPAID',
      daysUntilDue,
      interestApplicable,
      totalPaid: latestStatement.amount_paid || 0,
      delayDays: null,
    };
  };

  const summaryMetrics = () => {
    // Use only latest statement per card
    const latestByCard = new Map<string, CCStatement>();
    statements.forEach(s => {
      if (!latestByCard.has(s.card_id)) latestByCard.set(s.card_id, s);
    });
    const latestStatements = Array.from(latestByCard.values());

    const totalOutstanding = latestStatements.reduce((sum, s) => sum + s.outstanding_balance, 0);
    const totalCreditLimit = latestStatements.reduce((sum, s) => {
      const card = cards.find(c => c.id === s.card_id);
      return sum + (s.outstanding_balance + s.available_credit_limit || card?.credit_limit || 0);
    }, 0);
    const avgUtilization = totalCreditLimit > 0 ? (totalOutstanding / totalCreditLimit) * 100 : 0;
    const totalInterest = latestStatements.reduce((sum, s) => sum + s.interest_charged, 0);
    const riskyCards = latestStatements.filter(s => {
      const m = getCardMetrics(s.card_id);
      return m && (m.riskLevel === 'HIGH' || m.riskLevel === 'CRITICAL');
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
    cards, statements, loading,
    addCard, addStatement, updateStatement,
    getCardMetrics, summaryMetrics, refetch: fetchAll,
  };
}
