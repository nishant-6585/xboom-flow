import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export interface CrmActivity {
  id: string;
  prospect_id: string;
  activity_type: string;
  subject: string;
  notes: string | null;
  outcome: string | null;
  followup_date: string | null;
  followup_completed: boolean;
  followup_completed_at: string | null;
  performed_by: string;
  performed_by_name: string;
  activity_date: string;
  created_at: string;
  updated_at: string;
}

export interface CrmActivityFormData {
  prospect_id: string;
  activity_type: string;
  subject: string;
  notes?: string;
  outcome?: string;
  followup_date?: string | null;
  activity_date?: string;
}

export function useCrmActivities(prospectId?: string) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: activities = [], isLoading: loading } = useQuery({
    queryKey: ['crm-activities', prospectId],
    queryFn: async () => {
      let query = supabase
        .from('crm_contact_activities')
        .select('*')
        .order('activity_date', { ascending: false });
      if (prospectId) query = query.eq('prospect_id', prospectId);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as CrmActivity[];
    },
    enabled: !!user && !!prospectId,
  });

  const createActivity = useMutation({
    mutationFn: async (formData: CrmActivityFormData) => {
      if (!user || !profile) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('crm_contact_activities')
        .insert({
          ...formData,
          performed_by: user.id,
          performed_by_name: profile.name,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-activities'] });
      toast.success('Activity logged! 📝');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const completeFollowup = useMutation({
    mutationFn: async (activityId: string) => {
      const { error } = await supabase
        .from('crm_contact_activities')
        .update({
          followup_completed: true,
          followup_completed_at: new Date().toISOString(),
        } as any)
        .eq('id', activityId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-activities'] });
      toast.success('Follow-up completed ✅');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    activities,
    loading,
    createActivity: createActivity.mutateAsync,
    creatingActivity: createActivity.isPending,
    completeFollowup: completeFollowup.mutate,
  };
}
