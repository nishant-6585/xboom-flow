import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DuplicateMatch {
  enquiry_id: string;
  customer_name: string;
  customer_company: string;
  product_name: string;
  match_type: string;
  similarity_score: number;
}

export function useDuplicateDetection() {
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [checking, setChecking] = useState(false);

  const checkDuplicates = useCallback(async (
    customerCompany: string,
    customerName: string,
    excludeId?: string
  ): Promise<DuplicateMatch[]> => {
    if (!customerCompany || customerCompany.trim().length < 3) {
      setDuplicates([]);
      return [];
    }

    setChecking(true);
    try {
      const { data, error } = await supabase.rpc('find_duplicate_enquiries', {
        p_customer_company: customerCompany,
        p_customer_name: customerName,
        p_exclude_id: excludeId || null,
        p_threshold: 0.4,
      });

      if (error) {
        console.error('Duplicate check error:', error);
        setDuplicates([]);
        return [];
      }

      const matches = (data || []) as DuplicateMatch[];
      setDuplicates(matches);
      return matches;
    } catch (err) {
      console.error('Duplicate detection failed:', err);
      setDuplicates([]);
      return [];
    } finally {
      setChecking(false);
    }
  }, []);

  const logDuplicateAlert = useCallback(async (
    enquiryId: string,
    matches: DuplicateMatch[]
  ) => {
    if (matches.length === 0) return;

    const alerts = matches.map(m => ({
      enquiry_id: enquiryId,
      matched_enquiry_id: m.enquiry_id,
      match_type: m.match_type,
      similarity_score: m.similarity_score,
    }));

    const { error } = await supabase
      .from('duplicate_alerts')
      .insert(alerts);

    if (error) {
      console.error('Failed to log duplicate alerts:', error);
    }
  }, []);

  const dismissDuplicate = useCallback(async (alertId: string, userId: string) => {
    const { error } = await supabase
      .from('duplicate_alerts')
      .update({
        is_dismissed: true,
        dismissed_by: userId,
        dismissed_at: new Date().toISOString(),
      })
      .eq('id', alertId);

    return !error;
  }, []);

  return {
    duplicates,
    checking,
    checkDuplicates,
    logDuplicateAlert,
    dismissDuplicate,
    clearDuplicates: () => setDuplicates([]),
  };
}
