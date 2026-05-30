import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Prospect {
  id: string;
  source_type: 'enquiry' | 'interakt' | 'myoperator' | 'email' | 'form_lead' | 'google_ads' | 'lead';
  source_id: string;
  customer_name: string;
  phone_number: string | null;
  email: string | null;
  company: string | null;
  city: string | null;
  product_name: string | null;
  notes: string | null;
  lead_source: string | null;
  is_a_category: boolean;
  a_category_marked_at: string | null;
  a_category_marked_by: string | null;
  status: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export function useProspects() {
  const queryClient = useQueryClient();

  const { data: prospects = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['prospects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prospects')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as Prospect[];
    },
  });

  const addProspectMutation = useMutation({
    mutationFn: async (prospect: Omit<Prospect, 'id' | 'created_at' | 'updated_at' | 'a_category_marked_at' | 'a_category_marked_by'>) => {
      const { data, error } = await supabase
        .from('prospects')
        .insert([prospect as any])
        .select()
        .single();
      if (error) {
        if (error.code === '23505') throw new Error('Already added as prospect');
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
      toast.success('Added to Prospects! +10 points 🎯');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const toggleACategoryMutation = useMutation({
    mutationFn: async ({ id, isACategory, userId }: { id: string; isACategory: boolean; userId: string }) => {
      const { error } = await supabase
        .from('prospects')
        .update({
          is_a_category: isACategory,
          a_category_marked_at: isACategory ? new Date().toISOString() : null,
          a_category_marked_by: isACategory ? userId : null,
        } as Record<string, unknown>)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
      if (variables.isACategory) {
        toast.success('Marked as A-Category Big Deal! +20 points 🌟');
      } else {
        toast.success('A-Category removed');
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed: ${error.message}`);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('prospects')
        .update({ status } as Record<string, unknown>)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
      toast.success('Prospect status updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed: ${error.message}`);
    },
  });

  const updateProspectTypeMutation = useMutation({
    mutationFn: async ({ id, prospectType }: { id: string; prospectType: string | null }) => {
      const { error } = await supabase
        .from('prospects')
        .update({ prospect_type: prospectType } as Record<string, unknown>)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
      toast.success('Prospect type updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed: ${error.message}`);
    },
  });

  const deleteProspectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('prospects')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
      toast.success('Prospect deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  return {
    prospects,
    loading,
    refetch,
    addProspect: addProspectMutation.mutateAsync,
    addingProspect: addProspectMutation.isPending,
    toggleACategory: toggleACategoryMutation.mutate,
    updateStatus: updateStatusMutation.mutate,
    updateProspectType: updateProspectTypeMutation.mutate,
    deleteProspect: deleteProspectMutation.mutateAsync,
    deletingProspect: deleteProspectMutation.isPending,
  };
}
