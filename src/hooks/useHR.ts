import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type WorkLocation = 'Office' | 'Remote' | 'Field';
export type ShiftType = 'Fixed' | 'Flexible';
export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'on_leave' | 'weekend' | 'holiday';
export type LeaveType = 'casual' | 'sick' | 'paid' | 'EL' | 'unpaid' | 'half_day' | 'half_day_casual' | 'half_day_sick' | 'half_day_paid' | 'half_day_EL' | 'half_day_unpaid' | 'wfh' | 'compoff';
// Note: 'casual', 'half_day_casual', 'paid', 'half_day_paid' kept in type for historical data but removed from UI selection
export type LeaveStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';

export interface Employee {
  id: string;
  user_id: string | null;
  name: string;
  department: string;
  role: string | null;
  manager_id: string | null;
  work_location: WorkLocation;
  shift_type: ShiftType;
  shift_start_time: string;
  shift_end_time: string;
  weekly_hours_target: number;
  monthly_attendance_target: number;
  is_active: boolean;
  joining_date: string | null;
  exit_date: string | null;
  employment_status: 'active' | 'probation' | 'resigned' | 'terminated';
  created_at: string;
  updated_at: string;
}

export interface AttendanceLog {
  id: string;
  employee_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  working_hours: number | null;
  status: AttendanceStatus;
  location: string | null;
  notes: string | null;
  checkout_missing: boolean;
  approved_by: string | null;
  approved_by_name: string | null;
  break_start_time: string | null;
  break_end_time: string | null;
  total_break_minutes: number | null;
  created_at: string;
  updated_at: string;
  // Soft auto-checkout fields
  auto_checkout_applied?: boolean;
  auto_checkout_time?: string | null;
  is_provisional_checkout?: boolean;
  corrected_by?: string | null;
  corrected_at?: string | null;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  status: LeaveStatus;
  approver_id: string | null;
  approver_name: string | null;
  approved_rejected_at: string | null;
  comments: string | null;
  applied_by_id: string | null;
  applied_by_name: string | null;
  is_hr_applied: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  employee_name?: string;
}

export interface EmployeeKPI {
  total_working_days: number;
  present_days: number;
  leave_days: number;
  attendance_percentage: number;
  total_working_hours: number;
  target_hours: number;
  hours_fulfilment_percentage: number;
  kpi_score: number;
}

export interface EmployeeAttendanceStatus {
  employee: Employee;
  todayLog: AttendanceLog | null;
  approvedLeave: LeaveRequest | null;
  pendingLeave: LeaveRequest | null;
}

export function useHR() {
  const { user, profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [myEmployee, setMyEmployee] = useState<Employee | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceLog | null>(null);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [weeklyHours, setWeeklyHours] = useState(0);
  const [teamAttendanceStatus, setTeamAttendanceStatus] = useState<EmployeeAttendanceStatus[]>([]);

  const fetchEmployees = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      const typedData = (data || []) as unknown as Employee[];
      setEmployees(typedData);
      
      // Find current user's employee record
      const myEmp = typedData.find((e) => e.user_id === user.id);
      setMyEmployee(myEmp || null);
    } catch (error: any) {
      console.error('Error fetching employees:', error);
    }
  }, [user]);

  const fetchTodayAttendance = useCallback(async () => {
    if (!user || !myEmployee) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('employee_id', myEmployee.id)
        .eq('date', today)
        .maybeSingle();
      
      if (error) throw error;
      setTodayAttendance(data as AttendanceLog | null);
    } catch (error: any) {
      console.error('Error fetching today attendance:', error);
    }
  }, [user, myEmployee]);

  const fetchWeeklyHours = useCallback(async () => {
    if (!user || !myEmployee) return;
    try {
      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('working_hours')
        .eq('employee_id', myEmployee.id)
        .gte('date', weekStart.toISOString().split('T')[0])
        .lte('date', today.toISOString().split('T')[0]);
      
      if (error) throw error;
      const total = (data || []).reduce((sum, log) => sum + (log.working_hours || 0), 0);
      setWeeklyHours(total);
    } catch (error: any) {
      console.error('Error fetching weekly hours:', error);
    }
  }, [user, myEmployee]);

  const fetchAttendanceLogs = useCallback(async (employeeId?: string, month?: Date) => {
    if (!user) return;
    try {
      const targetMonth = month || new Date();
      const startDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
      const endDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
      
      let query = supabase
        .from('attendance_logs')
        .select('*')
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])
        .order('date', { ascending: false });
      
      if (employeeId) {
        query = query.eq('employee_id', employeeId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      setAttendanceLogs((data as AttendanceLog[]) || []);
    } catch (error: any) {
      console.error('Error fetching attendance logs:', error);
    }
  }, [user]);

  const fetchLeaveRequests = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*, employees!inner(name)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const transformed = (data || []).map((lr: any) => ({
        ...lr,
        employee_name: lr.employees?.name,
      }));
      
      setLeaveRequests(transformed);
      setPendingLeaves(transformed.filter((lr: LeaveRequest) => lr.status === 'submitted'));
    } catch (error: any) {
      console.error('Error fetching leave requests:', error);
    }
  }, [user]);

  const fetchTeamAttendanceStatus = useCallback(async () => {
    if (!user) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch all employees
      const { data: employeesData, error: empError } = await supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (empError) throw empError;
      
      const allEmployees = (employeesData || []) as unknown as Employee[];
      
      // Fetch today's attendance for all employees
      const { data: attendanceData, error: attError } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('date', today);
      
      if (attError) throw attError;
      
      const todayLogs = (attendanceData || []) as unknown as AttendanceLog[];
      
      // Fetch leave requests that cover today
      const { data: leavesData, error: leaveError } = await supabase
        .from('leave_requests')
        .select('*')
        .lte('start_date', today)
        .gte('end_date', today);
      
      if (leaveError) throw leaveError;
      
      const todayLeaves = leavesData || [];
      
      // Build status for each employee
      const statusList: EmployeeAttendanceStatus[] = allEmployees.map((emp) => {
        const todayLog = todayLogs.find((log) => log.employee_id === emp.id) || null;
        const approvedLeave = todayLeaves.find(
          (lr: any) => lr.employee_id === emp.id && lr.status === 'approved'
        ) as LeaveRequest | undefined;
        const pendingLeave = todayLeaves.find(
          (lr: any) => lr.employee_id === emp.id && lr.status === 'submitted'
        ) as LeaveRequest | undefined;
        
        return {
          employee: emp,
          todayLog,
          approvedLeave: approvedLeave || null,
          pendingLeave: pendingLeave || null,
        };
      });
      
      setTeamAttendanceStatus(statusList);
    } catch (error: any) {
      console.error('Error fetching team attendance status:', error);
    }
  }, [user]);

  const initialLoadDoneRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!initialLoadDoneRef.current) {
      setLoading(true);
    }
    await fetchEmployees();
    await fetchTeamAttendanceStatus();
    setLoading(false);
    initialLoadDoneRef.current = true;
  }, [fetchEmployees, fetchTeamAttendanceStatus]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (myEmployee) {
      fetchTodayAttendance();
      fetchWeeklyHours();
      fetchAttendanceLogs(myEmployee.id);
      fetchLeaveRequests();
    }
  }, [myEmployee, fetchTodayAttendance, fetchWeeklyHours, fetchAttendanceLogs, fetchLeaveRequests]);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('hr_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => {
        fetchTodayAttendance();
        fetchWeeklyHours();
        if (myEmployee) fetchAttendanceLogs(myEmployee.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => {
        fetchLeaveRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTodayAttendance, fetchWeeklyHours, fetchAttendanceLogs, fetchLeaveRequests, myEmployee]);

  const checkIn = async (): Promise<boolean> => {
    if (!user || !myEmployee) {
      toast.error('Employee record not found');
      return false;
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const now = new Date();
      const nowIso = now.toISOString();

      // If already checked out, allow re-check-in and record the gap as break
      if (todayAttendance?.check_in_time && todayAttendance?.check_out_time) {
        const checkOutTime = new Date(todayAttendance.check_out_time);
        const breakMinutes = (now.getTime() - checkOutTime.getTime()) / (1000 * 60);
        const totalBreakMinutes = (todayAttendance.total_break_minutes || 0) + breakMinutes;

        const { error } = await supabase
          .from('attendance_logs')
          .update({
            check_out_time: null,
            total_break_minutes: totalBreakMinutes,
          })
          .eq('id', todayAttendance.id);

        if (error) throw error;

        // Ensure UI reflects the change even if realtime isn't configured
        await fetchTodayAttendance();
        await fetchWeeklyHours();
        await fetchAttendanceLogs(myEmployee.id);

        toast.success(`Re-checked in (${Math.round(breakMinutes)} mins break added)`);
        return true;
      }

      // Check if already checked in (without checkout)
      if (todayAttendance?.check_in_time && !todayAttendance?.check_out_time) {
        toast.error('Already checked in today');
        return false;
      }

      if (todayAttendance) {
        // Update existing record
        const { error } = await supabase
          .from('attendance_logs')
          .update({ check_in_time: nowIso, status: 'present' })
          .eq('id', todayAttendance.id);
        if (error) throw error;
      } else {
        // Create new record
        const { error } = await supabase
          .from('attendance_logs')
          .insert({
            employee_id: myEmployee.id,
            date: today,
            check_in_time: nowIso,
            status: 'present',
          });
        if (error) throw error;
      }

      // Ensure UI reflects the change even if realtime isn't configured
      await fetchTodayAttendance();
      await fetchWeeklyHours();
      await fetchAttendanceLogs(myEmployee.id);

      toast.success('Checked in successfully');
      return true;
    } catch (error: any) {
      console.error('Error checking in:', error);
      toast.error(error.message || 'Failed to check in');
      return false;
    }
  };

  const checkOut = async (): Promise<boolean> => {
    if (!user || !myEmployee || !todayAttendance) {
      toast.error('No check-in found for today');
      return false;
    }

    if (!todayAttendance.check_in_time) {
      toast.error('Please check in first');
      return false;
    }

    if (todayAttendance.check_out_time) {
      toast.error('Already checked out today');
      return false;
    }

    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('attendance_logs')
        .update({ check_out_time: now, checkout_missing: false })
        .eq('id', todayAttendance.id);

      if (error) throw error;

      // Ensure UI reflects the change even if realtime isn't configured
      await fetchTodayAttendance();
      await fetchWeeklyHours();
      await fetchAttendanceLogs(myEmployee.id);

      toast.success('Checked out successfully');
      return true;
    } catch (error: any) {
      console.error('Error checking out:', error);
      toast.error(error.message || 'Failed to check out');
      return false;
    }
  };

  const startBreak = async (): Promise<boolean> => {
    if (!user || !myEmployee || !todayAttendance) {
      toast.error('No check-in found for today');
      return false;
    }

    if (!todayAttendance.check_in_time) {
      toast.error('Please check in first');
      return false;
    }

    if (todayAttendance.check_out_time) {
      toast.error('Already checked out');
      return false;
    }

    if (todayAttendance.break_start_time && !todayAttendance.break_end_time) {
      toast.error('Already on break');
      return false;
    }

    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('attendance_logs')
        .update({ break_start_time: now, break_end_time: null })
        .eq('id', todayAttendance.id);

      if (error) throw error;

      // Ensure UI reflects the change even if realtime isn't configured
      await fetchTodayAttendance();
      await fetchWeeklyHours();
      await fetchAttendanceLogs(myEmployee.id);

      toast.success('Break started');
      return true;
    } catch (error: any) {
      console.error('Error starting break:', error);
      toast.error(error.message || 'Failed to start break');
      return false;
    }
  };

  const endBreak = async (): Promise<boolean> => {
    if (!user || !myEmployee || !todayAttendance) {
      toast.error('No attendance record found');
      return false;
    }

    if (!todayAttendance.break_start_time) {
      toast.error('No active break found');
      return false;
    }

    if (todayAttendance.break_end_time) {
      toast.error('Break already ended');
      return false;
    }

    try {
      const now = new Date();
      const breakStart = new Date(todayAttendance.break_start_time);
      const breakMinutes = (now.getTime() - breakStart.getTime()) / (1000 * 60);
      const totalBreakMinutes = (todayAttendance.total_break_minutes || 0) + breakMinutes;

      const { error } = await supabase
        .from('attendance_logs')
        .update({
          break_end_time: now.toISOString(),
          total_break_minutes: totalBreakMinutes,
        })
        .eq('id', todayAttendance.id);

      if (error) throw error;

      // Ensure UI reflects the change even if realtime isn't configured
      await fetchTodayAttendance();
      await fetchWeeklyHours();
      await fetchAttendanceLogs(myEmployee.id);

      toast.success(`Break ended (${Math.round(breakMinutes)} mins)`);
      return true;
    } catch (error: any) {
      console.error('Error ending break:', error);
      toast.error(error.message || 'Failed to end break');
      return false;
    }
  };

  const applyLeave = async (data: {
    leave_type: LeaveType;
    start_date: string;
    end_date: string;
    reason?: string;
    compoff?: {
      earned_date: string;
      earned_type: 'holiday' | 'weekend';
      holiday_id?: string | null;
      holiday_name?: string | null;
      ledger_id?: string | null; // if already-earned available row being redeemed
    };
  }): Promise<boolean> => {
    if (!user || !myEmployee) {
      toast.error('Employee record not found');
      return false;
    }

    try {
      // CompOff: ensure a ledger row exists (status='available') and link to leave request.
      let ledgerId: string | null = data.compoff?.ledger_id ?? null;
      if (data.leave_type === 'compoff' && data.compoff && !ledgerId) {
        // Employees cannot insert into compoff_ledger directly (HR/Admin-only RLS).
        // Use the validated SECURITY DEFINER RPC which checks weekend/holiday +
        // attendance before creating the credit row.
        const { data: claimedId, error: ledgerErr } = await supabase.rpc(
          'claim_compoff_credit',
          {
            p_earned_date: data.compoff.earned_date,
            p_earned_type: data.compoff.earned_type,
            p_holiday_id: data.compoff.holiday_id ?? null,
          } as any,
        );
        if (ledgerErr) throw ledgerErr;
        ledgerId = (claimedId as string) ?? null;
      }

      const { error } = await supabase
        .from('leave_requests')
        .insert({
          employee_id: myEmployee.id,
          leave_type: data.leave_type,
          start_date: data.start_date,
          end_date: data.end_date,
          reason: data.reason,
          status: 'submitted',
        })
        .select('id')
        .single()
        .then(async (res) => {
          if (res.error) return res;
          if (ledgerId && res.data?.id) {
            await supabase
              .from('compoff_ledger')
              .update({ leave_request_id: res.data.id })
              .eq('id', ledgerId);
          }
          return res;
        });

      if (error) throw error;
      toast.success('Leave request submitted');
      return true;
    } catch (error: any) {
      console.error('Error applying leave:', error);
      toast.error(error.message || 'Failed to submit leave request');
      return false;
    }
  };

  const deductLeaveBalance = async (employeeId: string, leaveType: string, totalDays: number) => {
    // Map leave types to balance-tracked types
    const balanceTypeMap: Record<string, string> = {
      EL: 'EL', half_day_EL: 'EL',
      casual: 'EL', half_day_casual: 'EL',
      paid: 'EL', half_day_paid: 'EL',
      sick: 'sick', half_day_sick: 'sick',
    };
    const balanceType = balanceTypeMap[leaveType];
    if (!balanceType || totalDays <= 0) return; // No balance tracking for unpaid/wfh/casual

    const year = new Date().getFullYear();
    const { data: existing } = await supabase
      .from('leave_balances')
      .select('balance')
      .eq('employee_id', employeeId)
      .eq('leave_type', balanceType)
      .eq('year', year)
      .maybeSingle();

    const oldBalance = existing?.balance ?? 0;
    const newBalance = Math.max(0, oldBalance - totalDays);

    const { error: balErr } = await supabase
      .from('leave_balances')
      .upsert({
        employee_id: employeeId,
        leave_type: balanceType,
        year,
        balance: newBalance,
      }, { onConflict: 'employee_id,leave_type,year' });

    if (balErr) console.error('Balance deduction error:', balErr);

    // Record debit transaction
    await supabase
      .from('leave_transactions')
      .insert({
        employee_id: employeeId,
        leave_type: balanceType,
        transaction_type: 'debit',
        amount: totalDays,
        balance_after: newBalance,
        credit_date: new Date().toISOString().split('T')[0],
        remarks: `Leave approved: ${leaveType} (${totalDays} days)`,
        created_by: user!.id,
      });
  };

  const refundLeaveBalance = async (
    employeeId: string,
    leaveType: string,
    totalDays: number,
    reasonRemark: string,
  ) => {
    const balanceTypeMap: Record<string, string> = {
      EL: 'EL', half_day_EL: 'EL',
      casual: 'EL', half_day_casual: 'EL',
      paid: 'EL', half_day_paid: 'EL',
      sick: 'sick', half_day_sick: 'sick',
    };
    const balanceType = balanceTypeMap[leaveType];
    if (!balanceType || totalDays <= 0) return;

    const year = new Date().getFullYear();
    const { data: existing } = await supabase
      .from('leave_balances')
      .select('balance')
      .eq('employee_id', employeeId)
      .eq('leave_type', balanceType)
      .eq('year', year)
      .maybeSingle();

    const oldBalance = existing?.balance ?? 0;
    const newBalance = oldBalance + totalDays;

    const { error: balErr } = await supabase
      .from('leave_balances')
      .upsert({
        employee_id: employeeId,
        leave_type: balanceType,
        year,
        balance: newBalance,
      }, { onConflict: 'employee_id,leave_type,year' });

    if (balErr) console.error('Balance refund error:', balErr);

    await supabase
      .from('leave_transactions')
      .insert({
        employee_id: employeeId,
        leave_type: balanceType,
        transaction_type: 'credit',
        amount: totalDays,
        balance_after: newBalance,
        credit_date: new Date().toISOString().split('T')[0],
        remarks: `${reasonRemark}: ${leaveType} (${totalDays} days)`,
        created_by: user!.id,
      });
  };

  const approveLeave = async (leaveId: string, approve: boolean, comments?: string): Promise<boolean> => {
    if (!user || !profile) return false;

    try {
      // Fetch current request so we can deduct on approval OR refund a
      // previously-approved leave that is now being rejected.
      const { data: leaveReq } = await supabase
        .from('leave_requests')
        .select('employee_id, leave_type, total_days, status')
        .eq('id', leaveId)
        .single();

      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: approve ? 'approved' : 'rejected',
          approver_id: user.id,
          approver_name: profile.name,
          approved_rejected_at: new Date().toISOString(),
          comments,
        })
        .eq('id', leaveId);

      if (error) throw error;

      // Deduct balance when approving
      if (approve && leaveReq) {
        // Only deduct if it wasn't already approved (prevents double-deduction).
        if (leaveReq.status !== 'approved') {
          await deductLeaveBalance(leaveReq.employee_id, leaveReq.leave_type, leaveReq.total_days ?? 0);
        }
      }

      // Refund balance when rejecting a leave that had been approved
      if (!approve && leaveReq && leaveReq.status === 'approved') {
        await refundLeaveBalance(
          leaveReq.employee_id,
          leaveReq.leave_type,
          leaveReq.total_days ?? 0,
          'Leave rejected — balance refunded',
        );
      }

      // CompOff: flip ledger status on approval, revert on rejection of a previously approved compoff.
      if (leaveReq && leaveReq.leave_type === 'compoff') {
        if (approve) {
          await supabase
            .from('compoff_ledger')
            .update({ status: 'redeemed', redeemed_on: new Date().toISOString().split('T')[0] })
            .eq('leave_request_id', leaveId);
        } else if (leaveReq.status === 'approved') {
          await supabase
            .from('compoff_ledger')
            .update({ status: 'available', redeemed_on: null })
            .eq('leave_request_id', leaveId);
        }
      }

      toast.success(approve ? 'Leave approved' : 'Leave rejected');
      return true;
    } catch (error: any) {
      console.error('Error updating leave:', error);
      toast.error(error.message || 'Failed to update leave request');
      return false;
    }
  };

  const applyLeaveForEmployee = async (data: {
    employee_id: string;
    leave_type: LeaveType;
    start_date: string;
    end_date: string;
    reason?: string;
  }): Promise<boolean> => {
    if (!user || !profile) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      // Check for overlapping leave
      const { data: existingLeaves } = await supabase
        .from('leave_requests')
        .select('id, start_date, end_date')
        .eq('employee_id', data.employee_id)
        .in('status', ['submitted', 'approved'])
        .lte('start_date', data.end_date)
        .gte('end_date', data.start_date);

      if (existingLeaves && existingLeaves.length > 0) {
        toast.error('Leave dates overlap with an existing leave request');
        return false;
      }

      // Insert leave request as auto-approved
      const { error } = await supabase
        .from('leave_requests')
        .insert({
          employee_id: data.employee_id,
          leave_type: data.leave_type,
          start_date: data.start_date,
          end_date: data.end_date,
          reason: data.reason,
          status: 'approved',
          approver_id: user.id,
          approver_name: profile.name,
          approved_rejected_at: new Date().toISOString(),
          applied_by_id: user.id,
          applied_by_name: profile.name,
          is_hr_applied: true,
          comments: `Leave applied by HR (${profile.name}) on behalf of employee`,
        } as any);

      if (error) throw error;

      // Calculate working days (exclude weekends) for balance deduction
      const start = new Date(data.start_date);
      const end = new Date(data.end_date);
      let workingDays = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) workingDays++;
      }

      // Adjust for half-day leave types
      const isHalfDay = data.leave_type.startsWith('half_day');
      const totalDays = isHalfDay ? workingDays * 0.5 : workingDays;

      // Deduct leave balance
      await deductLeaveBalance(data.employee_id, data.leave_type, totalDays);

      // Update attendance logs for each leave day
      const start2 = new Date(data.start_date);
      const end2 = new Date(data.end_date);
      for (let d = new Date(start2); d <= end2; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const dayOfWeek = d.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        await supabase
          .from('attendance_logs')
          .upsert({
            employee_id: data.employee_id,
            date: dateStr,
            status: 'on_leave',
            notes: `${data.leave_type} - Applied by HR (${profile.name})`,
            source: 'hr_leave_apply',
          } as any, { onConflict: 'employee_id,date' });
      }

      toast.success('Leave applied and approved successfully');
      fetchLeaveRequests();
      return true;
    } catch (error: any) {
      console.error('Error applying leave for employee:', error);
      toast.error(error.message || 'Failed to apply leave');
      return false;
    }
  };

  const getEmployeeKPI = useCallback(
    async (employeeId: string, month?: Date): Promise<EmployeeKPI | null> => {
      try {
        const targetMonth = month || new Date();
        const { data, error } = await supabase.rpc('get_employee_kpi', {
          p_employee_id: employeeId,
          p_month: targetMonth.toISOString().split('T')[0],
        });

        if (error) throw error;
        return data?.[0] || null;
      } catch (error: any) {
        console.error('Error fetching KPI:', error);
        return null;
      }
    },
    []
  );

  const createEmployee = async (data: Partial<Employee>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('employees')
        .insert(data as any);

      if (error) throw error;
      toast.success('Employee created');
      fetchEmployees();
      return true;
    } catch (error: any) {
      console.error('Error creating employee:', error);
      toast.error(error.message || 'Failed to create employee');
      return false;
    }
  };

  return {
    employees,
    myEmployee,
    todayAttendance,
    attendanceLogs,
    leaveRequests,
    pendingLeaves,
    weeklyHours,
    teamAttendanceStatus,
    loading,
    checkIn,
    checkOut,
    startBreak,
    endBreak,
    applyLeave,
    applyLeaveForEmployee,
    approveLeave,
    getEmployeeKPI,
    createEmployee,
    fetchAttendanceLogs,
    fetchTeamAttendanceStatus,
    refetch: fetchAll,
  };
}
