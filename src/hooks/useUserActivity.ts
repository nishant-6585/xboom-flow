import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useRef } from 'react';

export interface UserActivityLog {
  id: string;
  user_id: string;
  user_name: string;
  session_start: string;
  session_end: string | null;
  duration_minutes: number | null;
  pages_visited: number;
  actions_performed: number;
  last_activity_at: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface UserActivitySummary {
  user_id: string;
  user_name: string;
  total_sessions: number;
  total_usage_minutes: number;
  avg_session_minutes: number;
  total_pages_visited: number;
  total_actions: number;
  last_active: string;
}

export interface ComprehensiveUserActivity {
  user_id: string;
  user_name: string;
  // Usage metrics
  total_usage_minutes: number;
  total_sessions: number;
  avg_session_minutes: number;
  last_active: string | null;
  // Sales metrics
  leads_handled: number;
  orders_won: number;
  pipeline_created: number;
  total_pipeline_value: number;
  // Attendance metrics
  present_days: number;
  total_working_hours: number;
  // Task metrics
  tasks_completed: number;
  tasks_pending: number;
  // Ticket metrics
  tickets_raised: number;
  tickets_resolved: number;
}

export function useUserActivityTracking() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const sessionIdRef = useRef<string | null>(null);
  const activityCountRef = useRef({ pages: 0, actions: 0 });

  // Start session on mount
  const startSession = useMutation({
    mutationFn: async () => {
      if (!user || !profile) return null;
      
      const { data, error } = await supabase
        .from('user_activity_logs')
        .insert({
          user_id: user.id,
          user_name: profile.name || 'Unknown',
          user_agent: navigator.userAgent,
        })
        .select('id')
        .single();
      
      if (error) throw error;
      return data.id;
    },
  });

  // Update session activity
  const updateActivity = useMutation({
    mutationFn: async ({ sessionId, pages, actions }: { sessionId: string; pages: number; actions: number }) => {
      const { error } = await supabase
        .from('user_activity_logs')
        .update({
          pages_visited: pages,
          actions_performed: actions,
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
      
      if (error) throw error;
    },
  });

  // End session
  const endSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { data: session } = await supabase
        .from('user_activity_logs')
        .select('session_start')
        .eq('id', sessionId)
        .single();
      
      if (session) {
        const startTime = new Date(session.session_start);
        const endTime = new Date();
        const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
        
        const { error } = await supabase
          .from('user_activity_logs')
          .update({
            session_end: endTime.toISOString(),
            duration_minutes: durationMinutes,
            pages_visited: activityCountRef.current.pages,
            actions_performed: activityCountRef.current.actions,
          })
          .eq('id', sessionId);
        
        if (error) throw error;
      }
    },
  });

  useEffect(() => {
    if (!user || !profile) return;

    // Start session
    startSession.mutateAsync().then(id => {
      if (id) sessionIdRef.current = id;
    });

    // Track page visits
    const handleRouteChange = () => {
      activityCountRef.current.pages += 1;
      if (sessionIdRef.current) {
        updateActivity.mutate({
          sessionId: sessionIdRef.current,
          pages: activityCountRef.current.pages,
          actions: activityCountRef.current.actions,
        });
      }
    };

    // Track user actions (clicks)
    const handleAction = () => {
      activityCountRef.current.actions += 1;
    };

    window.addEventListener('popstate', handleRouteChange);
    document.addEventListener('click', handleAction);

    // End session on unload
    const handleUnload = () => {
      if (sessionIdRef.current) {
        // Use sendBeacon for reliable unload tracking
        const payload = JSON.stringify({
          session_id: sessionIdRef.current,
          pages: activityCountRef.current.pages,
          actions: activityCountRef.current.actions,
        });
        navigator.sendBeacon('/api/end-session', payload);
      }
    };

    window.addEventListener('beforeunload', handleUnload);

    // Update activity every 5 minutes
    const interval = setInterval(() => {
      if (sessionIdRef.current) {
        updateActivity.mutate({
          sessionId: sessionIdRef.current,
          pages: activityCountRef.current.pages,
          actions: activityCountRef.current.actions,
        });
      }
    }, 5 * 60 * 1000);

    return () => {
      window.removeEventListener('popstate', handleRouteChange);
      document.removeEventListener('click', handleAction);
      window.removeEventListener('beforeunload', handleUnload);
      clearInterval(interval);
      
      // End session on unmount
      if (sessionIdRef.current) {
        endSession.mutate(sessionIdRef.current);
      }
    };
  }, [user?.id, profile?.name]);

  return { sessionId: sessionIdRef.current };
}

export function useUserActivitySummary(startDate?: string, endDate?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-activity-summary', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_user_activity_summary', {
          p_start_date: startDate || null,
          p_end_date: endDate || null,
        });
      
      if (error) throw error;
      return data as UserActivitySummary[];
    },
    enabled: !!user,
  });
}

export function useComprehensiveUserActivity(startDate?: string, endDate?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['comprehensive-user-activity', startDate, endDate],
    queryFn: async () => {
      // Fetch all user data in parallel
      const [profilesRes, activityRes, salesRes, attendanceRes, tasksRes, ticketsRes] = await Promise.all([
        // Get all approved users
        supabase
          .from('profiles')
          .select('user_id, name')
          .eq('is_approved', true),
        
        // Get activity summary
        supabase.rpc('get_user_activity_summary', {
          p_start_date: startDate || null,
          p_end_date: endDate || null,
        }),
        
        // Get sales leaderboard
        supabase.rpc('get_sales_leaderboard', {
          start_date: startDate || null,
          end_date: endDate || null,
        }),
        
        // Get attendance data
        supabase
          .from('attendance_logs')
          .select('employee_id, status, working_hours, date')
          .gte('date', startDate || '1900-01-01')
          .lte('date', endDate || '2100-12-31'),
        
        // Get tasks
        supabase
          .from('tasks')
          .select('assigned_to, status, created_at')
          .gte('created_at', startDate ? `${startDate}T00:00:00` : '1900-01-01')
          .lte('created_at', endDate ? `${endDate}T23:59:59` : '2100-12-31'),
        
        // Get tickets
        supabase
          .from('tickets')
          .select('raised_by, resolved_by, status, created_at')
          .gte('created_at', startDate ? `${startDate}T00:00:00` : '1900-01-01')
          .lte('created_at', endDate ? `${endDate}T23:59:59` : '2100-12-31'),
      ]);

      // Get employees to map employee_id to user_id
      const employeesRes = await supabase
        .from('employees')
        .select('id, user_id');

      const profiles = profilesRes.data || [];
      const activityData = (activityRes.data || []) as UserActivitySummary[];
      const salesData = salesRes.data || [];
      const attendanceData = attendanceRes.data || [];
      const tasksData = tasksRes.data || [];
      const ticketsData = ticketsRes.data || [];
      const employees = employeesRes.data || [];

      // Create employee to user mapping
      const employeeToUser = new Map(employees.map(e => [e.id, e.user_id]));

      // Build comprehensive activity for each user
      const result: ComprehensiveUserActivity[] = profiles.map(profile => {
        const activity = activityData.find(a => a.user_id === profile.user_id);
        const sales = salesData.find((s: any) => s.user_id === profile.user_id);
        
        // Find employee ID for this user
        const employeeEntry = employees.find(e => e.user_id === profile.user_id);
        const employeeId = employeeEntry?.id;
        
        // Attendance for this user
        const userAttendance = attendanceData.filter(a => a.employee_id === employeeId);
        const presentDays = userAttendance.filter(a => a.status === 'present').length;
        const totalHours = userAttendance.reduce((sum, a) => sum + (a.working_hours || 0), 0);
        
        // Tasks for this user
        const userTasks = tasksData.filter(t => t.assigned_to === profile.user_id);
        const completedTasks = userTasks.filter(t => t.status === 'completed').length;
        const pendingTasks = userTasks.filter(t => t.status !== 'completed').length;
        
        // Tickets for this user
        const raisedTickets = ticketsData.filter(t => t.raised_by === profile.user_id).length;
        const resolvedTickets = ticketsData.filter(t => t.resolved_by === profile.user_id).length;

        return {
          user_id: profile.user_id,
          user_name: profile.name || 'Unknown',
          total_usage_minutes: activity?.total_usage_minutes || 0,
          total_sessions: activity?.total_sessions || 0,
          avg_session_minutes: activity?.avg_session_minutes || 0,
          last_active: activity?.last_active || null,
          leads_handled: sales?.leads_handled || 0,
          orders_won: sales?.orders_won || 0,
          pipeline_created: sales?.pipeline_created || 0,
          total_pipeline_value: sales?.total_pipeline_value || 0,
          present_days: presentDays,
          total_working_hours: Math.round(totalHours * 10) / 10,
          tasks_completed: completedTasks,
          tasks_pending: pendingTasks,
          tickets_raised: raisedTickets,
          tickets_resolved: resolvedTickets,
        };
      });

      return result;
    },
    enabled: !!user,
  });
}
