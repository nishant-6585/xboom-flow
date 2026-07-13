import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { hasAttendanceForDate } from '@/lib/compoff';

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

export interface CompOffRequestInfo {
  id: string;
  status: 'submitted' | 'approved' | 'rejected' | 'cancelled';
  start_date: string;
  end_date: string;
  created_at: string;
  approved_rejected_at: string | null;
  approver_name: string | null;
  comments: string | null;
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
  const [requestsByLedger, setRequestsByLedger] = useState<Record<string, CompOffRequestInfo>>({});
  const [resolvedEmployeeId, setResolvedEmployeeId] = useState<string | null>(null);

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
      setResolvedEmployeeId(empId);
      if (!empId) { setLedger([]); setBalance(0); setRequestsByLedger({}); return; }

      const { data: rows } = await supabase
        .from('compoff_ledger')
        .select('*')
        .eq('employee_id', empId)
        .order('earned_date', { ascending: false });
      const ledgerRows = (rows || []) as CompOffLedgerRow[];
      setLedger(ledgerRows);

      const today = new Date().toISOString().split('T')[0];
      setBalance(ledgerRows.filter(r => r.status === 'available' && r.expires_at >= today).length);

      // Fetch linked leave_requests to build a per-ledger status timeline
      const reqIds = ledgerRows
        .map(r => r.leave_request_id)
        .filter((x): x is string => !!x);
      if (reqIds.length) {
        const { data: reqs } = await supabase
          .from('leave_requests')
          .select('id, status, start_date, end_date, created_at, approved_rejected_at, approver_name, comments')
          .in('id', reqIds);
        const byLedger: Record<string, CompOffRequestInfo> = {};
        (reqs || []).forEach((r: any) => {
          const ledger = ledgerRows.find(l => l.leave_request_id === r.id);
          if (ledger) byLedger[ledger.id] = r as CompOffRequestInfo;
        });
        setRequestsByLedger(byLedger);
      } else {
        setRequestsByLedger({});
      }

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

  const checkAttendance = useCallback(async (date: string) => {
    if (!resolvedEmployeeId) return false;
    return hasAttendanceForDate(resolvedEmployeeId, date);
  }, [resolvedEmployeeId]);

  const today = new Date().toISOString().split('T')[0];
  const stats = {
    available: ledger.filter(r => r.status === 'available' && r.expires_at >= today).length,
    redeemed: ledger.filter(r => r.status === 'redeemed').length,
    expired: ledger.filter(r => r.status === 'expired' || (r.status === 'available' && r.expires_at < today)).length,
    nextExpiry: ledger
      .filter(r => r.status === 'available' && r.expires_at >= today)
      .map(r => r.expires_at)
      .sort()[0] ?? null,
  };

  return {
    ledger,
    balance,
    holidays,
    loading,
    claimedEarnedDates,
    requestsByLedger,
    stats,
    checkAttendance,
    refetch: fetchAll,
  };
}