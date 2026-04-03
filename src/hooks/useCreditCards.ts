import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CreditCard {
  id: string;
  card_name: string;
  bank_name: string;
  credit_limit: number;
  is_active: boolean;
  created_at: string;
}

export interface CCStatement {
  id: string;
  card_id: string;
  billing_month: string;
  due_date: string;
  outstanding_balance: number;
  total_due: number;
  minimum_due: number;
  amount_paid: number;
  payment_date: string | null;
  interest_charged: number;
  late_fee: number;
  payment_status: string;
  available_credit_limit: number;
  upload_id: string | null;
  created_at: string;
}

export interface CCTransaction {
  id: string;
  statement_id: string;
  card_id: string;
  transaction_date: string;
  description: string;
  category: string;
  transaction_type: string;
  amount: number;
  merchant_name: string;
  created_at: string;
}

export interface CCPayment {
  id: string;
  statement_id: string;
  card_id: string;
  amount: number;
  payment_date: string;
  payment_mode: string;
  reference_number: string | null;
  notes: string | null;
  recorded_by: string;
  recorded_by_name: string;
  created_at: string;
}

export interface StatementUpload {
  id: string;
  file_url: string;
  file_name: string;
  detected_bank: string | null;
  detected_card_name: string | null;
  card_id: string | null;
  statement_id: string | null;
  uploaded_by: string;
  status: string;
  confidence_score: number | null;
  error_message: string | null;
  created_at: string;
}

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

function markStaleUploads(uploads: StatementUpload[]): StatementUpload[] {
  const now = Date.now();
  return uploads.map(u => {
    if (u.status === 'PROCESSING') {
      const created = new Date(u.created_at).getTime();
      if (now - created > STALE_THRESHOLD_MS) {
        return { ...u, status: 'FAILED', error_message: 'Processing timed out' };
      }
    }
    return u;
  });
}

export function useCreditCards() {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [statements, setStatements] = useState<CCStatement[]>([]);
  const [transactions, setTransactions] = useState<CCTransaction[]>([]);
  const [payments, setPayments] = useState<CCPayment[]>([]);
  const [uploads, setUploads] = useState<StatementUpload[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cardsRes, stmtRes, txnRes, payRes, uploadsRes] = await Promise.all([
        supabase.from('credit_cards' as any).select('*').order('card_name'),
        supabase.from('cc_statements' as any).select('*').order('due_date', { ascending: false }),
        supabase.from('cc_transactions' as any).select('*').order('transaction_date', { ascending: false }).limit(1000),
        supabase.from('cc_payments' as any).select('*').order('payment_date', { ascending: false }),
        supabase.from('statement_uploads' as any).select('*').order('created_at', { ascending: false }).limit(20),
      ]);
      setCards((cardsRes.data as any[]) || []);
      setStatements((stmtRes.data as any[]) || []);
      setTransactions((txnRes.data as any[]) || []);
      setPayments((payRes.data as any[]) || []);
      setUploads(markStaleUploads((uploadsRes.data as any[]) || []));
    } catch (e) {
      console.error('Error fetching CC data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const checkDuplicate = (bankName: string, cardName: string, billingMonth: string) => {
    const matchedCard = cards.find(c =>
      c.bank_name.toLowerCase() === bankName.toLowerCase() &&
      c.card_name.toLowerCase() === cardName.toLowerCase()
    );
    if (!matchedCard) return { isDuplicate: false };
    const existingStmt = statements.find(s => s.card_id === matchedCard.id && s.billing_month === billingMonth);
    if (!existingStmt) return { isDuplicate: false };
    return { isDuplicate: true, existingCard: matchedCard, existingStatement: existingStmt };
  };

  const uploadStatement = async (file: File, password?: string): Promise<{ success: boolean; error?: string; duplicate?: boolean; password_required?: boolean }> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, error: 'Not authenticated' };

      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${user.id}/${Date.now()}_${sanitizedName}`;
      const { error: uploadError } = await supabase.storage.from('cc-statements').upload(filePath, file);
      if (uploadError) return { success: false, error: uploadError.message };

      const { data: upload, error: insertError } = await supabase
        .from('statement_uploads' as any)
        .insert({ file_url: filePath, file_name: sanitizedName, uploaded_by: user.id, status: 'PROCESSING' } as any)
        .select()
        .single();
      if (insertError) return { success: false, error: insertError.message };

      const uploadRecord = upload as any;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const { data: session } = await supabase.auth.getSession();

      const requestBody: any = { upload_id: uploadRecord.id, file_url: filePath, file_name: sanitizedName };
      if (password) requestBody.pdf_password = password;

      let response: Response;
      try {
        response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/parse-credit-card-statement`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.session?.access_token}`,
            },
            body: JSON.stringify(requestBody),
          }
        );
      } catch (networkError: any) {
        await supabase.from('statement_uploads' as any).update({
          status: 'FAILED', error_message: 'Network error: ' + (networkError.message || 'Could not reach server'),
        } as any).eq('id', uploadRecord.id);
        await fetchAll();
        return { success: false, error: 'Network error. Please try again.' };
      }

      let result: any;
      try { result = await response.json(); } catch {
        await supabase.from('statement_uploads' as any).update({ status: 'FAILED', error_message: 'Invalid server response' } as any).eq('id', uploadRecord.id);
        await fetchAll();
        return { success: false, error: 'Server returned invalid response' };
      }

      await fetchAll();

      if (!response.ok || !result.success) {
        if (result.password_required) {
          return { success: false, error: result.error, password_required: true };
        }
        if (response.status >= 500) {
          await supabase.from('statement_uploads' as any).update({ status: 'FAILED', error_message: result.error || 'Processing failed' } as any).eq('id', uploadRecord.id);
          await fetchAll();
        }
        return { success: false, error: result.error || 'Processing failed', duplicate: result.duplicate || false };
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const recordPayment = async (data: {
    statement_id: string;
    card_id: string;
    amount: number;
    payment_date: string;
    payment_mode: string;
    reference_number?: string;
    notes?: string;
  }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: profile } = await supabase.from('profiles' as any).select('name').eq('user_id', user.id).single();

    const { error } = await supabase.from('cc_payments' as any).insert({
      ...data,
      recorded_by: user.id,
      recorded_by_name: (profile as any)?.name || user.email || 'Unknown',
    } as any);

    if (error) return { success: false, error: error.message };
    await fetchAll();
    return { success: true };
  };

  const getStatementFile = async (fileUrl: string) => {
    const { data, error } = await supabase.storage.from('cc-statements').download(fileUrl);
    if (error || !data) return null;
    return data;
  };

  const getSummary = () => {
    const latestByCard = new Map<string, CCStatement>();
    statements.forEach(s => {
      if (!latestByCard.has(s.card_id)) latestByCard.set(s.card_id, s);
    });
    const latest = Array.from(latestByCard.values());

    const totalOutstanding = latest.reduce((sum, s) => sum + s.outstanding_balance, 0);
    const totalCreditLimit = latest.reduce((sum, s) => {
      const card = cards.find(c => c.id === s.card_id);
      return sum + (card?.credit_limit || (s.outstanding_balance + s.available_credit_limit));
    }, 0);
    const avgUtilization = totalCreditLimit > 0 ? (totalOutstanding / totalCreditLimit) * 100 : 0;
    const totalInterest = latest.reduce((sum, s) => sum + s.interest_charged, 0);

    const riskyCards = latest.filter(s => {
      const card = cards.find(c => c.id === s.card_id);
      const limit = card?.credit_limit || (s.outstanding_balance + s.available_credit_limit);
      const util = limit > 0 ? (s.outstanding_balance / limit) * 100 : 0;
      return util > 80 || (new Date(s.due_date) < new Date() && s.payment_status !== 'FULL');
    }).length;

    return { totalOutstanding, totalCreditLimit, avgUtilization: Math.round(avgUtilization * 10) / 10, totalInterest, riskyCards, totalCards: cards.length };
  };

  return {
    cards, statements, transactions, payments, uploads, loading,
    uploadStatement, getSummary, checkDuplicate, refetch: fetchAll,
    recordPayment, getStatementFile,
  };
}
