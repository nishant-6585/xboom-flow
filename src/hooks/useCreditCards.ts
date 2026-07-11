import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getStatementCreditLimit, getStatementOutstanding, getStatementUtilization } from '@/lib/creditCardMetrics';

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

export interface StatementFilePayload {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

const STALE_THRESHOLD_MS = 5 * 60 * 1000;
const EDGE_FUNCTION_BASE_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;

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

const getEdgeFunctionUrl = (name: string) => `${EDGE_FUNCTION_BASE_URL}/${name}`;

const getSessionAccessToken = async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
};

const parseContentDispositionFileName = (contentDisposition: string | null, fallback: string) => {
  const utfMatch = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1]);

  const quotedMatch = contentDisposition?.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) return quotedMatch[1];

  return fallback;
};

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
      const accessToken = await getSessionAccessToken();
      if (!accessToken) return { success: false, error: 'Not authenticated' };

      const requestBody: any = { upload_id: uploadRecord.id, file_url: filePath, file_name: sanitizedName };
      if (password) requestBody.pdf_password = password;

      let response: Response;
      try {
        response = await fetch(getEdgeFunctionUrl('parse-credit-card-statement'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify(requestBody),
        });
      } catch (networkError: any) {
        await supabase.from('statement_uploads' as any).update({
          status: 'FAILED', error_message: 'Network error: ' + (networkError.message || 'Could not reach server'),
        } as any).eq('id', uploadRecord.id);
        await fetchAll();
        return { success: false, error: 'Network error. Please try again.' };
      }

      let result: any;
      try {
        result = await response.json();
      } catch {
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

  const updatePayment = async (
    paymentId: string,
    updates: {
      amount?: number;
      payment_date?: string;
      payment_mode?: string;
      reference_number?: string | null;
      notes?: string | null;
    },
  ) => {
    try {
      const { error } = await supabase
        .from('cc_payments' as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', paymentId);
      if (error) return { success: false, error: error.message };
      await fetchAll();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const deletePayment = async (paymentId: string) => {
    try {
      const { error } = await supabase
        .from('cc_payments' as any)
        .delete()
        .eq('id', paymentId);
      if (error) return { success: false, error: error.message };
      await fetchAll();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const getStatementFile = async (uploadId: string): Promise<StatementFilePayload | null> => {
    try {
      const accessToken = await getSessionAccessToken();
      if (!accessToken) return null;

      const response = await fetch(getEdgeFunctionUrl('view-credit-card-statement'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ upload_id: uploadId }),
      });

      if (!response.ok) {
        return null;
      }

      return {
        blob: await response.blob(),
        mimeType: response.headers.get('content-type') || 'application/octet-stream',
        fileName: parseContentDispositionFileName(response.headers.get('content-disposition'), 'statement'),
      };
    } catch (error) {
      console.error('Failed to load statement file:', error);
      return null;
    }
  };

  const reanalyzeStatement = async (data: {
    uploadId: string;
    fileUrl: string;
    fileName: string;
    guidance?: string;
  }): Promise<{ success: boolean; error?: string; password_required?: boolean }> => {
    try {
      const accessToken = await getSessionAccessToken();
      if (!accessToken) return { success: false, error: 'Not authenticated' };

      const response = await fetch(getEdgeFunctionUrl('parse-credit-card-statement'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          upload_id: data.uploadId,
          file_url: data.fileUrl,
          file_name: data.fileName,
          force_reprocess: true,
          user_guidance: data.guidance?.trim() || undefined,
        }),
      });

      let result: any = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      await fetchAll();

      if (!response.ok || !result?.success) {
        return {
          success: false,
          error: result?.error || 'Re-analysis failed',
          password_required: !!result?.password_required,
        };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Re-analysis failed' };
    }
  };

  const replaceStatementFile = async (file: File, uploadId: string, password?: string): Promise<{ success: boolean; error?: string; password_required?: boolean }> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, error: 'Not authenticated' };

      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${user.id}/${Date.now()}_${sanitizedName}`;
      const { error: uploadError } = await supabase.storage.from('cc-statements').upload(filePath, file);
      if (uploadError) return { success: false, error: uploadError.message };

      // Update the upload record with new file
      await supabase.from('statement_uploads' as any).update({
        file_url: filePath,
        file_name: sanitizedName,
        status: 'PROCESSING',
        error_message: null,
      } as any).eq('id', uploadId);

      const accessToken = await getSessionAccessToken();
      if (!accessToken) return { success: false, error: 'Not authenticated' };

      const requestBody: any = { upload_id: uploadId, file_url: filePath, file_name: sanitizedName, force_reprocess: true };
      if (password) requestBody.pdf_password = password;

      const response = await fetch(getEdgeFunctionUrl('parse-credit-card-statement'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify(requestBody),
      });

      let result: any;
      try { result = await response.json(); } catch { result = null; }
      await fetchAll();

      if (!response.ok || !result?.success) {
        return { success: false, error: result?.error || 'Processing failed', password_required: !!result?.password_required };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const getSummary = () => {
    const latestByCard = new Map<string, CCStatement>();
    statements.forEach(s => {
      if (!latestByCard.has(s.card_id)) latestByCard.set(s.card_id, s);
    });
    const latest = Array.from(latestByCard.values());

    const totalOutstanding = latest.reduce((sum, s) => {
      const card = cards.find(c => c.id === s.card_id);
      return sum + getStatementOutstanding(s, card);
    }, 0);
    const totalCreditLimit = latest.reduce((sum, s) => {
      const card = cards.find(c => c.id === s.card_id);
      return sum + getStatementCreditLimit(s, card);
    }, 0);
    const avgUtilization = totalCreditLimit > 0 ? (totalOutstanding / totalCreditLimit) * 100 : 0;
    const totalInterest = latest.reduce((sum, s) => sum + s.interest_charged, 0);

    const riskyCards = latest.filter(s => {
      const card = cards.find(c => c.id === s.card_id);
      const util = getStatementUtilization(s, card);
      return util > 80 || (new Date(s.due_date) < new Date() && s.payment_status !== 'FULL');
    }).length;

    return { totalOutstanding, totalCreditLimit, avgUtilization: Math.round(avgUtilization * 10) / 10, totalInterest, riskyCards, totalCards: cards.length };
  };

  const deleteCardWithData = async (cardId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, error: 'Not authenticated' };

      // Delete in order: transactions → payments → statements → uploads → card
      const cardStatements = statements.filter(s => s.card_id === cardId);
      const stmtIds = cardStatements.map(s => s.id);

      if (stmtIds.length > 0) {
        // Delete child records first
        await supabase.from('cc_transactions' as any).delete().in('statement_id', stmtIds);
        await supabase.from('cc_payments' as any).delete().in('statement_id', stmtIds);
        
        // Clear upload_id FK on statements before deleting uploads
        for (const sid of stmtIds) {
          await supabase.from('cc_statements' as any).update({ upload_id: null } as any).eq('id', sid);
        }

        // Delete upload records and storage files
        const cardUploads = uploads.filter(u => stmtIds.includes(u.statement_id || '') || u.card_id === cardId);
        for (const u of cardUploads) {
          if (u.file_url) {
            await supabase.storage.from('cc-statements').remove([u.file_url]);
          }
        }
        await supabase.from('statement_uploads' as any).delete().in('statement_id', stmtIds);
        await supabase.from('statement_uploads' as any).delete().eq('card_id', cardId);
        
        // Now delete statements
        await supabase.from('cc_statements' as any).delete().in('id', stmtIds);
      }

      // Also delete any orphan uploads linked to this card
      await supabase.from('statement_uploads' as any).delete().eq('card_id', cardId);

      const { error } = await supabase.from('credit_cards' as any).delete().eq('id', cardId);
      if (error) return { success: false, error: error.message };

      await fetchAll();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const updateStatement = async (statementId: string, updates: Partial<Pick<CCStatement, 'total_due' | 'minimum_due' | 'outstanding_balance' | 'available_credit_limit' | 'interest_charged' | 'late_fee' | 'due_date' | 'billing_month'>>) => {
    try {
      const { error } = await supabase
        .from('cc_statements' as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', statementId);
      if (error) return { success: false, error: error.message };
      await fetchAll();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const updateCard = async (cardId: string, updates: Partial<Pick<CreditCard, 'bank_name' | 'card_name' | 'credit_limit'>>) => {
    try {
      const { error } = await supabase
        .from('credit_cards' as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', cardId);
      if (error) return { success: false, error: error.message };
      await fetchAll();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  return {
    cards, statements, transactions, payments, uploads, loading,
    uploadStatement, getSummary, checkDuplicate, refetch: fetchAll,
    recordPayment, getStatementFile, reanalyzeStatement, replaceStatementFile,
    deleteCardWithData, updateStatement, updateCard,
    updatePayment, deletePayment,
  };
}
