import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export interface Followup {
  id: string;
  user_id: string;
  source_type: 'prospect' | 'pipeline' | 'enquiry' | 'lead' | 'company';
  source_id: string;
  customer_name: string;
  customer_company: string | null;
  product_name: string | null;
  phone: string | null;
  email: string | null;
  is_a_category: boolean;
  followup_at: string;
  reminder_sent: boolean;
  status: 'pending' | 'completed' | 'missed' | 'cancelled';
  remark: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface FollowupFormData {
  source_type: 'prospect' | 'pipeline' | 'enquiry' | 'lead' | 'company';
  source_id: string;
  customer_name: string;
  customer_company?: string | null;
  product_name?: string | null;
  phone?: string | null;
  email?: string | null;
  is_a_category?: boolean;
  followup_at: string;
}

export function useFollowups() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: followups = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['followups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('followups')
        .select('*')
        .order('followup_at', { ascending: false });
      if (error) throw error;
      return data as unknown as Followup[];
    },
    enabled: !!user,
  });

  const createFollowup = async (formData: FollowupFormData): Promise<Followup | null> => {
    if (!user || !profile) return null;
    try {
      const { data, error } = await supabase
        .from('followups')
        .insert({
          ...formData,
          user_id: user.id,
          created_by: user.id,
          created_by_name: profile.name,
        } as any)
        .select()
        .single();
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['followups'] });
      toast.success('Follow-up scheduled! 📅');
      return data as unknown as Followup;
    } catch (error: any) {
      toast.error(error.message || 'Failed to schedule follow-up');
      return null;
    }
  };

  const completeFollowup = async (id: string, remark: string): Promise<boolean> => {
    if (!user || !profile) return false;
    try {
      const { error } = await supabase
        .from('followups')
        .update({
          status: 'completed',
          remark,
          completed_at: new Date().toISOString(),
          completed_by: user.id,
          completed_by_name: profile.name,
        } as any)
        .eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['followups'] });
      toast.success('Follow-up completed! ✅');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete follow-up');
      return false;
    }
  };

  const cancelFollowup = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('followups')
        .update({ status: 'cancelled' } as any)
        .eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['followups'] });
      toast.success('Follow-up cancelled');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to cancel follow-up');
      return false;
    }
  };

  const rescheduleFollowup = async (id: string, newDate: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('followups')
        .update({ followup_at: newDate, status: 'pending' } as any)
        .eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['followups'] });
      toast.success('Follow-up rescheduled');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to reschedule');
      return false;
    }
  };

  return { followups, loading, refetch, createFollowup, completeFollowup, cancelFollowup, rescheduleFollowup };
}
