import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface CustomerTestimonial {
  id: string;
  order_id: string | null;
  customer_name: string;
  customer_company: string | null;
  testimonial: string;
  rating: number | null;
  is_approved: boolean;
  submitted_by: string;
  submitted_by_name: string;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  created_at: string;
}

export function useCustomerTestimonials() {
  const { user, profile, role } = useAuth();
  const queryClient = useQueryClient();

  const { data: testimonials, isLoading } = useQuery({
    queryKey: ['customer-testimonials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_testimonials')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as CustomerTestimonial[];
    },
    enabled: !!user,
  });

  const createTestimonial = useMutation({
    mutationFn: async (testimonial: {
      order_id?: string;
      customer_name: string;
      customer_company?: string;
      testimonial: string;
      rating?: number;
    }) => {
      const { error } = await supabase
        .from('customer_testimonials')
        .insert({
          ...testimonial,
          submitted_by: user?.id,
          submitted_by_name: profile?.name || 'Unknown',
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-testimonials'] });
      queryClient.invalidateQueries({ queryKey: ['sales-points'] });
      toast.success('Testimonial submitted! Points awarded.');
    },
    onError: (error: Error) => {
      toast.error(`Error submitting testimonial: ${error.message}`);
    },
  });

  const approveTestimonial = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('customer_testimonials')
        .update({
          is_approved: true,
          approved_by: user?.id,
          approved_by_name: profile?.name,
          approved_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-testimonials'] });
      queryClient.invalidateQueries({ queryKey: ['sales-points'] });
      toast.success('Testimonial approved! Bonus points awarded to submitter.');
    },
    onError: (error: Error) => {
      toast.error(`Error approving testimonial: ${error.message}`);
    },
  });

  const deleteTestimonial = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('customer_testimonials')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-testimonials'] });
      toast.success('Testimonial deleted');
    },
    onError: (error: Error) => {
      toast.error(`Error deleting: ${error.message}`);
    },
  });

  return { 
    testimonials, 
    isLoading, 
    createTestimonial, 
    approveTestimonial,
    deleteTestimonial,
  };
}
