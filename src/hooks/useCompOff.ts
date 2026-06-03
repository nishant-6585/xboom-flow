import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CompOffLedgerRow {
  id: string;
  employee_id: string;
  earned_date: string;
  earned_type: 'holiday' | 'weekend';
  holiday_id: string | null;
  holiday_name: string | null;
  status: 'available' | 'redeemed' | 'expired';
  redeemed_on: string | null;
  leave_request_id: string | null;
  expires_at: string;
  created_at: string;
}

export interface HolidayOption {
  id: string;
  name: string;
  holiday_date: string;
}

export function useCompOff(employeeId?: string) {
  const { user } = useAuth();
  const [ledger, setLedger] = useState<CompOffLedgerRow[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [holidays, setHolidays] = useState<HolidayOption[]>([]);
  const [loading, setLoading] = useState(false);

  const resolveEmployeeId = useCallback(async (): Promise<string | null> => {
    if (employeeId) return employeeId;
    if (!user) return null;
    const { data } = await supabase.from('employees').select('id').eq('user_id', user.id).maybeSingle();
    return data?.id ?? null;
  }, [employeeId, user]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const empId = await resolveEmployeeId();
      if (!empId) { setLedger([]); setBalance(0); return; }

      const { data: rows } = await supabase
        .from('compoff_ledger')
        .select('*')
        .eq('employee_id', empId)
        .order('earned_date', { ascending: false });
      const ledgerRows = (rows || []) as CompOffLedgerRow[];
      setLedger(ledgerRows);

      const today = new Date().toISOString().split('T')[0];
      setBalance(ledgerRows.filter(r => r.status === 'available' && r.expires_at >= today).length);

      const year = new Date().getFullYear();
      const { data: hols } = await supabase
        .from('holidays')
        .select('id, name, holiday_date')
        .gte('holiday_date', `${year}-01-01`)
        .lte('holiday_date', `${year}-12-31`)
        .order('holiday_date');
      setHolidays((hols || []) as HolidayOption[]);
    } finally {
      setLoading(false);
    }
  }, [resolveEmployeeId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const claimedEarnedDates = new Set(ledger.map(r => r.earned_date));

  return { ledger, balance, holidays, loading, claimedEarnedDates, refetch: fetchAll };
}