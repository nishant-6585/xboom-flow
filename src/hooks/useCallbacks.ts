import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export interface MissedCallback {
  id: string;
  call_log_id: string | null;
  caller_number: string;
  customer_name: string | null;
  customer_company: string | null;
  product_name: string | null;
  city: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_by: string | null;
  assigned_by_name: string | null;
  status: 'pending' | 'completed' | 'cancelled' | 'reassigned';
  priority: 'high' | 'normal' | 'low';
  remark: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
  call_time: string;
  created_at: string;
  updated_at: string;
}

export function useCallbacks() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: callbacks = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['missed_call_callbacks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('missed_call_callbacks')
        .select('*')
        .order('call_time', { ascending: false });
      if (error) throw error;
      return data as unknown as MissedCallback[];
    },
    enabled: !!user,
  });

  const createCallback = async (data: {
    call_log_id?: string;
    caller_number: string;
    customer_name?: string | null;
    customer_company?: string | null;
    product_name?: string | null;
    city?: string | null;
    assigned_to?: string | null;
    assigned_to_name?: string | null;
    priority?: string;
    call_time?: string;
  }): Promise<MissedCallback | null> => {
    if (!user || !profile) return null;
    try {
      const { data: result, error } = await supabase
        .from('missed_call_callbacks')
        .insert({
          ...data,
          assigned_by: user.id,
          assigned_by_name: profile.name,
        } as any)
        .select()
        .single();
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['missed_call_callbacks'] });
      toast.success('Callback assigned! 📞');
      return result as unknown as MissedCallback;
    } catch (error: any) {
      toast.error(error.message || 'Failed to create callback');
      return null;
    }
  };

  const completeCallback = async (id: string, remark: string): Promise<boolean> => {
    if (!user || !profile) return false;
    try {
      const { error } = await supabase
        .from('missed_call_callbacks')
        .update({
          status: 'completed',
          remark,
          completed_at: new Date().toISOString(),
          completed_by: user.id,
          completed_by_name: profile.name,
        } as any)
        .eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['missed_call_callbacks'] });
      toast.success('Callback completed! ✅');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete callback');
      return false;
    }
  };

  const reassignCallback = async (id: string, assignedTo: string, assignedToName: string): Promise<boolean> => {
    if (!user || !profile) return false;
    try {
      const { error } = await supabase
        .from('missed_call_callbacks')
        .update({
          assigned_to: assignedTo,
          assigned_to_name: assignedToName,
          assigned_by: user.id,
          assigned_by_name: profile.name,
          status: 'pending',
        } as any)
        .eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['missed_call_callbacks'] });
      toast.success(`Callback reassigned to ${assignedToName}`);
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to reassign callback');
      return false;
    }
  };

  const cancelCallback = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('missed_call_callbacks')
        .update({ status: 'cancelled' } as any)
        .eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['missed_call_callbacks'] });
      toast.success('Callback cancelled');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to cancel callback');
      return false;
    }
  };

  return { callbacks, loading, refetch, createCallback, completeCallback, reassignCallback, cancelCallback };
}
