import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type WorkLocation = 'Office' | 'Remote' | 'Field';
export type ShiftType = 'Fixed' | 'Flexible';
export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'on_leave' | 'weekend' | 'holiday';
export type LeaveType = 'casual' | 'sick' | 'paid' | 'unpaid' | 'half_day';
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

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await fetchEmployees();
    setLoading(false);
  }, [fetchEmployees]);

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
            working_hours: null // Will be recalculated on next checkout
          })
          .eq('id', todayAttendance.id);
        
        if (error) throw error;
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
          total_break_minutes: totalBreakMinutes
        })
        .eq('id', todayAttendance.id);

      if (error) throw error;
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
  }): Promise<boolean> => {
    if (!user || !myEmployee) {
      toast.error('Employee record not found');
      return false;
    }

    try {
      const { error } = await supabase
        .from('leave_requests')
        .insert({
          employee_id: myEmployee.id,
          leave_type: data.leave_type,
          start_date: data.start_date,
          end_date: data.end_date,
          reason: data.reason,
          status: 'submitted',
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

  const approveLeave = async (leaveId: string, approve: boolean, comments?: string): Promise<boolean> => {
    if (!user || !profile) return false;

    try {
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
      toast.success(approve ? 'Leave approved' : 'Leave rejected');
      return true;
    } catch (error: any) {
      console.error('Error updating leave:', error);
      toast.error(error.message || 'Failed to update leave request');
      return false;
    }
  };

  const getEmployeeKPI = async (employeeId: string, month?: Date): Promise<EmployeeKPI | null> => {
    try {
      const targetMonth = month || new Date();
      const { data, error } = await supabase
        .rpc('get_employee_kpi', {
          p_employee_id: employeeId,
          p_month: targetMonth.toISOString().split('T')[0],
        });

      if (error) throw error;
      return data?.[0] || null;
    } catch (error: any) {
      console.error('Error fetching KPI:', error);
      return null;
    }
  };

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
    loading,
    checkIn,
    checkOut,
    startBreak,
    endBreak,
    applyLeave,
    approveLeave,
    getEmployeeKPI,
    createEmployee,
    fetchAttendanceLogs,
    refetch: fetchAll,
  };
}
