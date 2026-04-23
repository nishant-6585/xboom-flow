import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type TaskType = 
  | 'sales_followup'
  | 'supplier_validation'
  | 'supplier_onboarding'
  | 'finance_review'
  | 'sales_confirmation'
  | 'hot_lead_followup'
  | 'mega_deal_review'
  | 'quotation_request'
  | 'order_confirmation'
  | 'hr_task'
  | 'custom';

export type TaskStatus = 'new' | 'in_progress' | 'awaiting_approval' | 'completed';
export type TaskStage = 'new' | 'started' | 'in_review' | 'on_hold' | 'completed';
export type TimerStatus = 'stopped' | 'running' | 'paused';

export interface Task {
  id: string;
  enquiry_id: string | null;
  order_id: string | null;
  pipeline_id: string | null;
  task_type: TaskType;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_to_name: string;
  assigned_role: 'sales' | 'supply_chain' | 'admin' | 'finance' | 'it' | 'marketing' | 'hr';
  assigned_by: string | null;
  assigned_by_name: string | null;
  status: TaskStatus;
  priority: number;
  due_date: string | null;
  parent_task_id: string | null;
  supplier_exists: boolean | null;
  flagged_as_new_supplier: boolean;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
  completion_notes: string | null;
  created_at: string;
  updated_at: string;
  // Timer fields
  time_spent_seconds: number;
  timer_started_at: string | null;
  timer_status: TimerStatus;
  stage: TaskStage;
}

export interface TaskFormData {
  enquiry_id?: string;
  order_id?: string;
  pipeline_id?: string;
  task_type: TaskType;
  title: string;
  description?: string;
  assigned_to: string;
  assigned_to_name: string;
  assigned_role: 'sales' | 'supply_chain' | 'admin' | 'finance' | 'it' | 'marketing' | 'hr';
  priority?: number;
  due_date?: string;
}

export interface TaskCounts {
  total_tasks: number;
  new_tasks: number;
  in_progress_tasks: number;
  awaiting_approval_tasks: number;
  overdue_tasks: number;
}

export const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'sales_followup', label: 'Sales Follow-up' },
  { value: 'supplier_validation', label: 'Supplier Validation' },
  { value: 'supplier_onboarding', label: 'Supplier Onboarding' },
  { value: 'finance_review', label: 'Finance Review' },
  { value: 'sales_confirmation', label: 'Sales Confirmation' },
  { value: 'hot_lead_followup', label: 'Hot Lead Follow-up' },
  { value: 'mega_deal_review', label: 'Mega Deal Review' },
  { value: 'quotation_request', label: 'Quotation Request' },
  { value: 'order_confirmation', label: 'Order Confirmation' },
  { value: 'hr_task', label: 'HR Task' },
  { value: 'custom', label: 'Custom Task' },
];

export const TASK_STATUSES: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: 'bg-blue-500' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-yellow-500' },
  { value: 'awaiting_approval', label: 'Awaiting Approval', color: 'bg-purple-500' },
  { value: 'completed', label: 'Completed', color: 'bg-green-500' },
];

export const TASK_STAGES: { value: TaskStage; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: 'bg-slate-500' },
  { value: 'started', label: 'Started', color: 'bg-blue-500' },
  { value: 'in_review', label: 'In Review', color: 'bg-purple-500' },
  { value: 'on_hold', label: 'On Hold', color: 'bg-yellow-500' },
  { value: 'completed', label: 'Completed', color: 'bg-green-500' },
];

export const PRIORITY_OPTIONS = [
  { value: 1, label: 'Priority 1', color: 'bg-red-500' },
  { value: 2, label: 'Priority 2', color: 'bg-orange-500' },
  { value: 3, label: 'Priority 3', color: 'bg-yellow-500' },
];

export function useTasks() {
  const { user, profile, role } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskCounts, setTaskCounts] = useState<TaskCounts | null>(null);

  const initialLoadDoneRef = useRef(false);

  const fetchTasks = useCallback(async () => {
    if (!user) return;

    try {
      if (!initialLoadDoneRef.current) {
        setLoading(true);
      }
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('priority', { ascending: true })
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTasks((data as Task[]) || []);
    } catch (error: any) {
      console.error('Error fetching tasks:', error);
      toast.error('Failed to fetch tasks');
    } finally {
      setLoading(false);
      initialLoadDoneRef.current = true;
    }
  }, [user]);

  const fetchTaskCounts = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .rpc('get_user_task_counts', { p_user_id: user.id });

      if (error) throw error;
      if (data && data.length > 0) {
        setTaskCounts(data[0] as TaskCounts);
      }
    } catch (error: any) {
      console.error('Error fetching task counts:', error);
    }
  }, [user]);

  useEffect(() => {
    fetchTasks();
    fetchTaskCounts();
  }, [fetchTasks, fetchTaskCounts]);

  useEffect(() => {
    const channel = supabase
      .channel('tasks_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        () => {
          fetchTasks();
          fetchTaskCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTasks, fetchTaskCounts]);

  const createTask = async (formData: TaskFormData): Promise<boolean> => {
    if (!user || !profile) return false;

    try {
      const payload = {
        ...formData,
        description: formData.description?.trim() || null,
        due_date: formData.due_date?.trim() ? new Date(formData.due_date).toISOString() : null,
        assigned_by: user.id,
        assigned_by_name: profile.name,
      };

      const { error } = await supabase.from('tasks').insert(payload as any);

      if (error) throw error;
      toast.success('Task created successfully');
      return true;
    } catch (error: any) {
      console.error('Error creating task:', error);
      toast.error(error.message || 'Failed to create task');
      return false;
    }
  };

  const updateTask = async (id: string, updates: Partial<Task>): Promise<boolean> => {
    if (!user || !profile) return false;

    try {
      // If completing the task, add completion info
      if (updates.status === 'completed') {
        updates.completed_at = new Date().toISOString();
        updates.completed_by = user.id;
        updates.completed_by_name = profile.name;
      }

      const { error } = await supabase
        .from('tasks')
        .update(updates as any)
        .eq('id', id);

      if (error) throw error;
      toast.success('Task updated successfully');
      return true;
    } catch (error: any) {
      console.error('Error updating task:', error);
      toast.error(error.message || 'Failed to update task');
      return false;
    }
  };

  const deleteTask = async (id: string): Promise<boolean> => {
    try {
      // Delete child tasks first (tasks that reference this as parent)
      const { error: childError } = await supabase
        .from('tasks')
        .delete()
        .eq('parent_task_id', id);

      if (childError) throw childError;

      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Task deleted successfully');
      await fetchTasks();
      return true;
    } catch (error: any) {
      console.error('Error deleting task:', error);
      toast.error(error.message || 'Failed to delete task');
      return false;
    }
  };

  const completeSupplierValidation = async (
    taskId: string,
    supplierExists: boolean,
    flagAsNewSupplier: boolean = false,
    notes?: string
  ): Promise<boolean> => {
    return updateTask(taskId, {
      status: 'completed',
      stage: 'completed',
      timer_status: 'stopped',
      supplier_exists: supplierExists,
      flagged_as_new_supplier: flagAsNewSupplier,
      completion_notes: notes,
    });
  };

  // Timer functions
  const startTimer = async (taskId: string): Promise<boolean> => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return false;

    const now = new Date().toISOString();
    const updates = {
      timer_status: 'running' as TimerStatus,
      timer_started_at: now,
      stage: (task.stage === 'new' ? 'started' : task.stage) as TaskStage,
      status: (task.status === 'new' ? 'in_progress' : task.status) as TaskStatus,
    };

    // Optimistic update for immediate UI feedback
    setTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, ...updates } : t
    ));

    try {
      const { error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId);

      if (error) throw error;
      toast.success('Timer started');
      return true;
    } catch (error: any) {
      console.error('Error starting timer:', error);
      toast.error('Failed to start timer');
      // Revert on error
      fetchTasks();
      return false;
    }
  };

  const pauseTimer = async (taskId: string): Promise<boolean> => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.timer_started_at) return false;

    const elapsedSeconds = Math.floor(
      (new Date().getTime() - new Date(task.timer_started_at).getTime()) / 1000
    );
    const newTimeSpent = (task.time_spent_seconds || 0) + elapsedSeconds;

    const updates = {
      timer_status: 'paused' as TimerStatus,
      timer_started_at: null as string | null,
      time_spent_seconds: newTimeSpent,
    };

    // Optimistic update for immediate UI feedback
    setTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, ...updates } : t
    ));

    try {
      const { error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId);

      if (error) throw error;
      toast.success('Timer paused');
      return true;
    } catch (error: any) {
      console.error('Error pausing timer:', error);
      toast.error('Failed to pause timer');
      // Revert on error
      fetchTasks();
      return false;
    }
  };

  const updateStage = async (taskId: string, stage: TaskStage): Promise<boolean> => {
    try {
      const updates: Partial<Task> = { stage };
      
      // Sync status with stage
      if (stage === 'completed') {
        updates.status = 'completed';
        updates.timer_status = 'stopped';
        updates.completed_at = new Date().toISOString();
        updates.completed_by = user?.id;
        updates.completed_by_name = profile?.name;
      } else if (stage === 'started') {
        updates.status = 'in_progress';
      } else if (stage === 'in_review') {
        updates.status = 'awaiting_approval';
      } else if (stage === 'on_hold') {
        updates.timer_status = 'paused';
      }

      const { error } = await supabase
        .from('tasks')
        .update(updates as any)
        .eq('id', taskId);

      if (error) throw error;
      toast.success(`Stage updated to ${stage}`);
      return true;
    } catch (error: any) {
      console.error('Error updating stage:', error);
      toast.error('Failed to update stage');
      return false;
    }
  };

  // Filter helpers
  const myTasks = tasks.filter(t => t.assigned_to === user?.id && t.status !== 'completed');
  const pendingTasks = tasks.filter(t => t.status === 'new');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const overdueTasks = tasks.filter(t => 
    t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed'
  );

  return {
    tasks,
    myTasks,
    pendingTasks,
    inProgressTasks,
    overdueTasks,
    taskCounts,
    loading,
    createTask,
    updateTask,
    deleteTask,
    completeSupplierValidation,
    startTimer,
    pauseTimer,
    updateStage,
    refetch: fetchTasks,
  };
}
