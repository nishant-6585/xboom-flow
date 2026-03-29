import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AttentionItem {
  id: string;
  source_type: 'enquiry' | 'interakt' | 'myoperator' | 'email' | 'form_lead';
  source_id: string;
  customer_name: string;
  phone_number: string | null;
  email: string | null;
  company: string | null;
  city: string | null;
  product_name: string | null;
  notes: string | null;
  status: string;
  marked_by: string;
  marked_by_name: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export function useAttentionItems() {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['attention-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attention_items')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as AttentionItem[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (item: Omit<AttentionItem, 'id' | 'created_at' | 'updated_at' | 'resolved_at' | 'resolved_by' | 'resolved_by_name'>) => {
      const { error } = await supabase
        .from('attention_items')
        .insert(item as any);
      if (error) throw error;

      // Send notification email
      try {
        await supabase.functions.invoke('send-attention-notification', {
          body: {
            customer_name: item.customer_name,
            source_type: item.source_type,
            product_name: item.product_name,
            marked_by_name: item.marked_by_name,
            company: item.company,
            phone_number: item.phone_number,
            email: item.email,
          },
        });
      } catch (e) {
        console.error('Failed to send attention notification:', e);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attention-items'] });
      toast.success('Marked for Attention! 🚨');
    },
    onError: (error: any) => {
      if (error?.code === '23505') {
        toast.info('Already marked for attention');
      } else {
        toast.error('Failed to mark for attention');
        console.error(error);
      }
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, userId, userName }: { id: string; userId: string; userName: string }) => {
      const { error } = await supabase
        .from('attention_items')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: userId,
          resolved_by_name: userName,
        } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attention-items'] });
      toast.success('Attention item resolved');
    },
    onError: () => {
      toast.error('Failed to resolve');
    },
  });

  return {
    items,
    loading,
    refetch,
    addItem: addMutation.mutateAsync,
    resolveItem: resolveMutation.mutateAsync,
    adding: addMutation.isPending,
  };
}
