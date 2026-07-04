import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type TargetPeriod = 'monthly' | 'quarterly';

export interface SalesTarget {
  id: string;
  user_id: string;
  user_name: string;
  target_period: TargetPeriod;
  period_start: string;
  period_end: string;
  revenue_target: number;
  orders_target: number;
  pipeline_target: number;
  revenue_achieved: number;
  orders_achieved: number;
  pipeline_achieved: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesTargetFormData {
  user_id: string;
  user_name: string;
  target_period: TargetPeriod;
  period_start: string;
  period_end: string;
  revenue_target: number;
  orders_target: number;
  pipeline_target: number;
  notes?: string;
}

export function useSalesTargets() {
  const { user, role } = useAuth();
  // Depend on user.id (stable primitive), not user object — see usePricelist.
  const userId = user?.id ?? null;
  const [targets, setTargets] = useState<SalesTarget[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTargets = useCallback(async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('sales_targets')
        .select('*')
        .order('period_start', { ascending: false });

      if (error) throw error;
      const all = (data as SalesTarget[]) || [];
      // Exclude Vishal (case-insensitive) across all TV slides consuming this hook
      setTargets(all.filter((t) => !(t.user_name || '').toLowerCase().includes('vishal')));
    } catch (error: any) {
      console.error('Error fetching sales targets:', error);
      toast.error('Failed to fetch sales targets');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchTargets();
  }, [fetchTargets]);

  const createTarget = async (formData: SalesTargetFormData): Promise<boolean> => {
    if (!user || role !== 'admin') {
      toast.error('Only admins can create targets');
      return false;
    }

    try {
      const { error } = await supabase.from('sales_targets').insert({
        ...formData,
        created_by: user.id,
      });

      if (error) throw error;
      toast.success('Sales target created successfully');
      fetchTargets();
      return true;
    } catch (error: any) {
      console.error('Error creating sales target:', error);
      toast.error(error.message || 'Failed to create sales target');
      return false;
    }
  };

  const updateTarget = async (id: string, updates: Partial<SalesTarget>): Promise<boolean> => {
    if (!user || role !== 'admin') {
      toast.error('Only admins can update targets');
      return false;
    }

    try {
      const { error } = await supabase
        .from('sales_targets')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      toast.success('Sales target updated successfully');
      fetchTargets();
      return true;
    } catch (error: any) {
      console.error('Error updating sales target:', error);
      toast.error(error.message || 'Failed to update sales target');
      return false;
    }
  };

  const deleteTarget = async (id: string): Promise<boolean> => {
    if (!user || role !== 'admin') {
      toast.error('Only admins can delete targets');
      return false;
    }

    try {
      const { error } = await supabase
        .from('sales_targets')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Sales target deleted successfully');
      fetchTargets();
      return true;
    } catch (error: any) {
      console.error('Error deleting sales target:', error);
      toast.error(error.message || 'Failed to delete sales target');
      return false;
    }
  };

  // Get current period targets for a user
  const getCurrentTargets = useCallback((userId: string) => {
    const now = new Date();
    return targets.filter(t => 
      t.user_id === userId &&
      new Date(t.period_start) <= now &&
      new Date(t.period_end) >= now
    );
  }, [targets]);

  return {
    targets,
    loading,
    createTarget,
    updateTarget,
    deleteTarget,
    getCurrentTargets,
    refetch: fetchTargets,
  };
}
