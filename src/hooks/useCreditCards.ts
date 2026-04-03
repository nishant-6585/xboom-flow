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

export function useCreditCards() {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [statements, setStatements] = useState<CCStatement[]>([]);
  const [uploads, setUploads] = useState<StatementUpload[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cardsRes, stmtRes, uploadsRes] = await Promise.all([
        supabase.from('credit_cards' as any).select('*').order('card_name'),
        supabase.from('cc_statements' as any).select('*').order('due_date', { ascending: false }),
        supabase.from('statement_uploads' as any).select('*').order('created_at', { ascending: false }).limit(20),
      ]);
      setCards((cardsRes.data as any[]) || []);
      setStatements((stmtRes.data as any[]) || []);
      setUploads((uploadsRes.data as any[]) || []);
    } catch (e) {
      console.error('Error fetching CC data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const uploadStatement = async (file: File): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, error: 'Not authenticated' };

      // Upload file
      const filePath = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('cc-statements').upload(filePath, file);
      if (uploadError) return { success: false, error: uploadError.message };

      // Create upload record
      const { data: upload, error: insertError } = await supabase
        .from('statement_uploads' as any)
        .insert({
          file_url: filePath,
          file_name: file.name,
          uploaded_by: user.id,
          status: 'PROCESSING',
        } as any)
        .select()
        .single();

      if (insertError) return { success: false, error: insertError.message };

      const uploadRecord = upload as any;

      // Call edge function
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const { data: session } = await supabase.auth.getSession();

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/parse-credit-card-statement`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({
            upload_id: uploadRecord.id,
            file_url: filePath,
            file_name: file.name,
          }),
        }
      );

      const result = await response.json();
      await fetchAll();

      if (!response.ok || !result.success) {
        return { success: false, error: result.error || 'Processing failed' };
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  // Summary metrics
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
    cards, statements, uploads, loading,
    uploadStatement, getSummary, refetch: fetchAll,
  };
}
