import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type KPIMeasurementUnit = 'percentage' | 'numeric' | 'currency' | 'count' | 'rating' | 'boolean';
export type KPIPriority = 'low' | 'medium' | 'high';
export type KPIRAGStatus = 'green' | 'amber' | 'red' | 'not_started';
export type KPISource = 'hr' | 'employee';
export type KPIWorkflowStatus = 'draft' | 'active' | 'completed' | 'reviewed';

export interface EmployeeKPIRecord {
  id: string;
  employee_id: string;
  title: string;
  description: string | null;
  month: number;
  year: number;
  target_value: number;
  measurement_unit: KPIMeasurementUnit;
  weightage: number;
  department: string | null;
  priority: KPIPriority;
  due_date: string;
  green_threshold: number;
  amber_threshold: number;
  status: KPIRAGStatus;
  achieved_value: number;
  achievement_percentage: number;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  kpi_source: KPISource;
  workflow_status: KPIWorkflowStatus;
  // Joined
  employee_name?: string;
}

export interface KPIProgressRecord {
  id: string;
  kpi_id: string;
  achieved_value: number;
  progress_notes: string | null;
  attachment_url: string | null;
  updated_by: string;
  updated_by_name: string;
  created_at: string;
}

export interface RoleResponsibility {
  id: string;
  employee_id: string;
  role_title: string;
  responsibilities: string;
  effective_date: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  employee_name?: string;
}

export interface KPIFormData {
  employee_id: string;
  title: string;
  description?: string;
  month: number;
  year: number;
  target_value: number;
  measurement_unit: KPIMeasurementUnit;
  weightage: number;
  department?: string;
  priority: KPIPriority;
  due_date: string;
  green_threshold: number;
  amber_threshold: number;
  kpi_source?: KPISource;
  workflow_status?: KPIWorkflowStatus;
}

export interface KPIAnalytics {
  totalKPIs: number;
  greenCount: number;
  amberCount: number;
  redCount: number;
  notStartedCount: number;
  avgAchievement: number;
  overallScore: number;
  departmentStats: { department: string; avg: number; count: number }[];
  monthlyTrends: { month: string; avg: number }[];
  hrCreatedCount: number;
  employeeCreatedCount: number;
}

export function useKPIManagement() {
  const { user, profile, role } = useAuth();
  const [kpis, setKpis] = useState<EmployeeKPIRecord[]>([]);
  const [myKpis, setMyKpis] = useState<EmployeeKPIRecord[]>([]);
  const [progressHistory, setProgressHistory] = useState<KPIProgressRecord[]>([]);
  const [rolesResponsibilities, setRolesResponsibilities] = useState<RoleResponsibility[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadDoneRef = useRef(false);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);

  const isHROrAdmin = role === 'admin' || role === 'hr';

  // Fetch current user's employee ID
  useEffect(() => {
    if (!user) return;
    const fetchMyEmployeeId = async () => {
      const { data } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      setMyEmployeeId(data?.id || null);
    };
    fetchMyEmployeeId();
  }, [user]);

  const fetchKPIs = useCallback(async () => {
    if (!user) return;
    if (!initialLoadDoneRef.current) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('employee_kpis')
        .select('*, employees!inner(name)')
        .order('year', { ascending: false })
        .order('month', { ascending: false });

      if (error) throw error;

      const transformed = (data || []).map((k: any) => ({
        ...k,
        employee_name: k.employees?.name,
        kpi_source: k.kpi_source || 'hr',
        workflow_status: k.workflow_status || 'active',
      }));

      if (isHROrAdmin) {
        setKpis(transformed);
      }

      setMyKpis(isHROrAdmin ? transformed : transformed);
    } catch (error: any) {
      console.error('Error fetching KPIs:', error);
    } finally {
      setLoading(false);
      initialLoadDoneRef.current = true;
    }
  }, [user, isHROrAdmin]);

  const fetchProgressHistory = useCallback(async (kpiId: string) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('employee_kpi_progress')
        .select('*')
        .eq('kpi_id', kpiId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProgressHistory((data || []) as KPIProgressRecord[]);
    } catch (error: any) {
      console.error('Error fetching progress:', error);
    }
  }, [user]);

  const fetchRolesResponsibilities = useCallback(async (employeeId?: string) => {
    if (!user) return;
    try {
      let query = supabase
        .from('employee_roles_responsibilities')
        .select('*, employees!inner(name)')
        .order('effective_date', { ascending: false });

      if (employeeId) {
        query = query.eq('employee_id', employeeId);
      }

      const { data, error } = await query;
      if (error) throw error;

      setRolesResponsibilities((data || []).map((r: any) => ({
        ...r,
        employee_name: r.employees?.name,
      })));
    } catch (error: any) {
      console.error('Error fetching roles:', error);
    }
  }, [user]);

  useEffect(() => {
    fetchKPIs();
    fetchRolesResponsibilities();
  }, [fetchKPIs, fetchRolesResponsibilities]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('kpi_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_kpis' }, () => {
        fetchKPIs();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_kpi_progress' }, () => {
        fetchKPIs();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchKPIs]);

  const createKPI = async (formData: KPIFormData): Promise<boolean> => {
    if (!user || !profile) return false;
    try {
      const { error } = await supabase.from('employee_kpis').insert({
        ...formData,
        created_by: user.id,
        created_by_name: profile.name,
        kpi_source: formData.kpi_source || 'hr',
        workflow_status: formData.workflow_status || (formData.kpi_source === 'employee' ? 'draft' : 'active'),
      });
      if (error) throw error;
      toast.success('KPI created successfully');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to create KPI');
      return false;
    }
  };

  const updateKPI = async (id: string, formData: Partial<KPIFormData>): Promise<boolean> => {
    if (!user) return false;
    try {
      const { error } = await supabase.from('employee_kpis').update(formData).eq('id', id);
      if (error) throw error;
      toast.success('KPI updated successfully');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to update KPI');
      return false;
    }
  };

  const updateWorkflowStatus = async (id: string, status: KPIWorkflowStatus): Promise<boolean> => {
    if (!user) return false;
    try {
      const { error } = await supabase.from('employee_kpis')
        .update({ workflow_status: status } as any)
        .eq('id', id);
      if (error) throw error;
      toast.success(`KPI status updated to ${status}`);
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to update status');
      return false;
    }
  };

  const deleteKPI = async (id: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const { error } = await supabase.from('employee_kpis').delete().eq('id', id);
      if (error) throw error;
      toast.success('KPI deleted successfully');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete KPI');
      return false;
    }
  };

  const updateProgress = async (kpiId: string, achievedValue: number, notes?: string, attachmentUrl?: string): Promise<boolean> => {
    if (!user || !profile) return false;
    try {
      const { error } = await supabase.from('employee_kpi_progress').insert({
        kpi_id: kpiId,
        achieved_value: achievedValue,
        progress_notes: notes || null,
        attachment_url: attachmentUrl || null,
        updated_by: user.id,
        updated_by_name: profile.name,
      });
      if (error) throw error;
      toast.success('Progress updated successfully');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to update progress');
      return false;
    }
  };

  const createRoleResponsibility = async (data: {
    employee_id: string;
    role_title: string;
    responsibilities: string;
    effective_date: string;
  }): Promise<boolean> => {
    if (!user || !profile) return false;
    try {
      const { error } = await supabase.from('employee_roles_responsibilities').insert({
        ...data,
        created_by: user.id,
        created_by_name: profile.name,
      });
      if (error) throw error;
      toast.success('Role & Responsibility created');
      fetchRolesResponsibilities();
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to create');
      return false;
    }
  };

  const deleteRoleResponsibility = async (id: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const { error } = await supabase.from('employee_roles_responsibilities').delete().eq('id', id);
      if (error) throw error;
      toast.success('Deleted successfully');
      fetchRolesResponsibilities();
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
      return false;
    }
  };

  // Analytics
  const getAnalytics = useCallback((filterMonth?: number, filterYear?: number, filterEmployeeId?: string, filterDepartment?: string, filterSource?: string): KPIAnalytics => {
    let filtered = isHROrAdmin ? kpis : myKpis;

    if (filterMonth) filtered = filtered.filter(k => k.month === filterMonth);
    if (filterYear) filtered = filtered.filter(k => k.year === filterYear);
    if (filterEmployeeId) filtered = filtered.filter(k => k.employee_id === filterEmployeeId);
    if (filterDepartment) filtered = filtered.filter(k => k.department === filterDepartment);
    if (filterSource && filterSource !== 'all') filtered = filtered.filter(k => k.kpi_source === filterSource);

    const greenCount = filtered.filter(k => k.status === 'green').length;
    const amberCount = filtered.filter(k => k.status === 'amber').length;
    const redCount = filtered.filter(k => k.status === 'red').length;
    const notStartedCount = filtered.filter(k => k.status === 'not_started').length;

    const avgAchievement = filtered.length > 0
      ? filtered.reduce((sum, k) => sum + (k.achievement_percentage || 0), 0) / filtered.length
      : 0;

    const totalWeightage = filtered.reduce((sum, k) => sum + k.weightage, 0);
    const overallScore = totalWeightage > 0
      ? filtered.reduce((sum, k) => sum + ((k.achievement_percentage || 0) * k.weightage), 0) / totalWeightage
      : 0;

    const deptMap = new Map<string, { total: number; count: number }>();
    filtered.forEach(k => {
      const dept = k.department || 'Unassigned';
      const existing = deptMap.get(dept) || { total: 0, count: 0 };
      deptMap.set(dept, { total: existing.total + (k.achievement_percentage || 0), count: existing.count + 1 });
    });
    const departmentStats = Array.from(deptMap.entries()).map(([department, { total, count }]) => ({
      department,
      avg: count > 0 ? total / count : 0,
      count,
    }));

    const monthMap = new Map<string, { total: number; count: number }>();
    filtered.forEach(k => {
      const key = `${k.year}-${String(k.month).padStart(2, '0')}`;
      const existing = monthMap.get(key) || { total: 0, count: 0 };
      monthMap.set(key, { total: existing.total + (k.achievement_percentage || 0), count: existing.count + 1 });
    });
    const monthlyTrends = Array.from(monthMap.entries())
      .map(([month, { total, count }]) => ({ month, avg: count > 0 ? total / count : 0 }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const hrCreatedCount = filtered.filter(k => k.kpi_source === 'hr').length;
    const employeeCreatedCount = filtered.filter(k => k.kpi_source === 'employee').length;

    return {
      totalKPIs: filtered.length,
      greenCount,
      amberCount,
      redCount,
      notStartedCount,
      avgAchievement,
      overallScore,
      departmentStats,
      monthlyTrends,
      hrCreatedCount,
      employeeCreatedCount,
    };
  }, [kpis, myKpis, isHROrAdmin]);

  return {
    kpis: isHROrAdmin ? kpis : myKpis,
    myKpis,
    progressHistory,
    rolesResponsibilities,
    loading,
    isHROrAdmin,
    myEmployeeId,
    createKPI,
    updateKPI,
    updateWorkflowStatus,
    deleteKPI,
    updateProgress,
    fetchProgressHistory,
    fetchRolesResponsibilities,
    createRoleResponsibility,
    deleteRoleResponsibility,
    getAnalytics,
  };
}
