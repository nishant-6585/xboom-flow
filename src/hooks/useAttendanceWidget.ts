import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type AttendanceWidgetStatus = 'not_checked_in' | 'working' | 'on_break' | 'completed';

export interface TodayAttendanceSummary {
  id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  total_break_minutes: number | null;
  working_hours: number | null;
  break_start_time: string | null;
  break_end_time: string | null;
  status: string | null;
  source: string;
  reconciliation_status: string;
}

export interface AttendanceBreak {
  id: string;
  attendance_id: string;
  break_start_time: string;
  break_end_time: string | null;
  break_duration_minutes: number | null;
}

export function useAttendanceWidget() {
  const { user } = useAuth();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendanceSummary | null>(null);
  const [breaks, setBreaks] = useState<AttendanceBreak[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const initializedRef = useRef(false);

  const fetchEmployeeId = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    if (data) setEmployeeId(data.id);
  }, [user]);

  const fetchTodayAttendance = useCallback(async () => {
    if (!user || !employeeId) return;
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', today)
      .maybeSingle();
    setTodayAttendance(data as TodayAttendanceSummary | null);
  }, [user, employeeId]);

  const fetchBreaks = useCallback(async () => {
    if (!todayAttendance?.id) return;
    const { data } = await supabase
      .from('attendance_breaks')
      .select('*')
      .eq('attendance_id', todayAttendance.id)
      .order('break_start_time');
    setBreaks((data as AttendanceBreak[]) || []);
  }, [todayAttendance?.id]);

  useEffect(() => {
    if (!initializedRef.current && user) {
      initializedRef.current = true;
      fetchEmployeeId();
    }
  }, [user, fetchEmployeeId]);

  useEffect(() => {
    if (employeeId) fetchTodayAttendance();
  }, [employeeId, fetchTodayAttendance]);

  useEffect(() => {
    if (todayAttendance?.id) fetchBreaks();
  }, [todayAttendance?.id, fetchBreaks]);

  // Realtime subscription
  useEffect(() => {
    if (!employeeId) return;
    const channel = supabase
      .channel('attendance_widget')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => {
        fetchTodayAttendance();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_breaks' }, () => {
        fetchBreaks();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [employeeId, fetchTodayAttendance, fetchBreaks]);

  const getStatus = (): AttendanceWidgetStatus => {
    if (!todayAttendance?.check_in_time) return 'not_checked_in';
    if (todayAttendance.check_out_time) return 'completed';
    if (todayAttendance.break_start_time && !todayAttendance.break_end_time) return 'on_break';
    return 'working';
  };

  const checkIn = async (): Promise<boolean> => {
    if (!employeeId) { toast.error('Employee record not found'); return false; }
    setActionLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const now = new Date().toISOString();

      // Re-check-in scenario
      if (todayAttendance?.check_in_time && todayAttendance?.check_out_time) {
        const { error } = await supabase
          .from('attendance_logs')
          .update({ check_out_time: null })
          .eq('id', todayAttendance.id);
        if (error) throw error;
        toast.success('Re-checked in successfully');
        await fetchTodayAttendance();
        return true;
      }

      if (todayAttendance?.check_in_time) {
        toast.error('Already checked in');
        return false;
      }

      if (todayAttendance) {
        const { error } = await supabase
          .from('attendance_logs')
          .update({ check_in_time: now, status: 'present' })
          .eq('id', todayAttendance.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('attendance_logs')
          .insert({ employee_id: employeeId, date: today, check_in_time: now, status: 'present', source: 'xboom' });
        if (error) throw error;
      }

      await fetchTodayAttendance();
      toast.success('Checked in successfully! 🟢');
      return true;
    } catch (e: any) {
      toast.error(e.message || 'Failed to check in');
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const checkOut = async (): Promise<boolean> => {
    if (!todayAttendance) { toast.error('No check-in found'); return false; }
    if (!todayAttendance.check_in_time) { toast.error('Please check in first'); return false; }
    if (todayAttendance.break_start_time && !todayAttendance.break_end_time) {
      toast.error('End your break before checking out');
      return false;
    }
    setActionLoading(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('attendance_logs')
        .update({ check_out_time: now, checkout_missing: false })
        .eq('id', todayAttendance.id);
      if (error) throw error;
      await fetchTodayAttendance();
      toast.success('Checked out successfully! ⚪');
      return true;
    } catch (e: any) {
      toast.error(e.message || 'Failed to check out');
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const startBreak = async (): Promise<boolean> => {
    if (!todayAttendance?.check_in_time) { toast.error('Please check in first'); return false; }
    if (todayAttendance.break_start_time && !todayAttendance.break_end_time) {
      toast.error('Already on break');
      return false;
    }
    setActionLoading(true);
    try {
      const now = new Date().toISOString();
      // Update attendance_logs to track active break
      const { error: logError } = await supabase
        .from('attendance_logs')
        .update({ break_start_time: now, break_end_time: null })
        .eq('id', todayAttendance.id);
      if (logError) throw logError;

      // Insert into attendance_breaks for historical record
      const { error: breakError } = await supabase
        .from('attendance_breaks')
        .insert({ attendance_id: todayAttendance.id, break_start_time: now });
      if (breakError) throw breakError;

      await fetchTodayAttendance();
      await fetchBreaks();
      toast.success('Break started 🟡');
      return true;
    } catch (e: any) {
      toast.error(e.message || 'Failed to start break');
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const endBreak = async (): Promise<boolean> => {
    if (!todayAttendance?.break_start_time || todayAttendance.break_end_time) {
      toast.error('No active break found');
      return false;
    }
    setActionLoading(true);
    try {
      const now = new Date();
      const breakStart = new Date(todayAttendance.break_start_time);
      const breakMinutes = (now.getTime() - breakStart.getTime()) / (1000 * 60);
      const totalBreakMinutes = (todayAttendance.total_break_minutes || 0) + breakMinutes;

      const { error: logError } = await supabase
        .from('attendance_logs')
        .update({
          break_end_time: now.toISOString(),
          total_break_minutes: totalBreakMinutes,
        })
        .eq('id', todayAttendance.id);
      if (logError) throw logError;

      // Update the active break record in attendance_breaks
      const activeBreak = breaks.find(b => !b.break_end_time);
      if (activeBreak) {
        await supabase
          .from('attendance_breaks')
          .update({
            break_end_time: now.toISOString(),
            break_duration_minutes: breakMinutes,
          })
          .eq('id', activeBreak.id);
      }

      await fetchTodayAttendance();
      await fetchBreaks();
      toast.success(`Break ended (${Math.round(breakMinutes)}m) 🟢`);
      return true;
    } catch (e: any) {
      toast.error(e.message || 'Failed to end break');
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  return {
    todayAttendance,
    breaks,
    status: getStatus(),
    loading,
    actionLoading,
    checkIn,
    checkOut,
    startBreak,
    endBreak,
    refetch: fetchTodayAttendance,
  };
}
