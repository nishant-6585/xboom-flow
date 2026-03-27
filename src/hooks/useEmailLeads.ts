import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const MAIL_SOURCES = [
  'hello@xboom.in',
  'contact@xboom.in',
  'sales@xboom.in',
] as const;

export type MailSource = typeof MAIL_SOURCES[number];

export interface EmailLead {
  id: string;
  customer_name: string;
  customer_company: string | null;
  phone_number: string | null;
  email: string | null;
  city: string | null;
  product_name: string | null;
  product_code: string | null;
  product_category: string | null;
  quantity: number | null;
  lead_source: string | null;
  mail_source: string;
  urgency: string | null;
  requested_timeline: string | null;
  purpose_of_purchase: string | null;
  notes: string | null;
  status: string;
  sales_person_id: string | null;
  sales_person_name: string | null;
  is_prospect: boolean;
  is_a_category: boolean;
  created_by: string | null;
  created_by_name: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useEmailLeads() {
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['email-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as EmailLead[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (lead: Partial<EmailLead>) => {
      const { error } = await supabase
        .from('email_leads')
        .insert([lead as any]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-leads'] });
      toast.success('Email lead created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Create failed: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (lead: Partial<EmailLead> & { id: string }) => {
      const { id, ...updates } = lead;
      const { error } = await supabase
        .from('email_leads')
        .update(updates as Record<string, unknown>)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-leads'] });
      toast.success('Email lead updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Update failed: ${error.message}`);
    },
  });

  return {
    leads,
    loading,
    refetch,
    createLead: createMutation.mutateAsync,
    creating: createMutation.isPending,
    updateLead: updateMutation.mutateAsync,
    updating: updateMutation.isPending,
  };
}
