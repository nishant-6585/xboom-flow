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
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  status: string;
  sales_person_id: string | null;
  sales_person_name: string | null;
  is_prospect: boolean;
  is_a_category: boolean;
  created_by: string | null;
  created_by_name: string | null;
  updated_by: string | null;
  processing_status: string;
  ai_processed: boolean;
  error_message: string | null;
  ai_confidence: number | null;
  ai_extracted_json: Record<string, unknown> | null;
  retry_count: number;
  email_lead_id: string | null;
  thread_id: string | null;
  ingested_at: string | null;
  processed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  disposition?: string | null;
  disposition_reason_code?: string | null;
  disposition_reason_note?: string | null;
  disposition_at?: string | null;
  disposition_by_name?: string | null;
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

  const approveLead = useMutation({
    mutationFn: async (leadId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/ai-email-lead-processor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ lead_id: leadId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approval failed');

      // Force status to processed if AI didn't auto-create
      await supabase.from('email_leads').update({ processing_status: 'processed' }).eq('id', leadId);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-leads'] });
      queryClient.invalidateQueries({ queryKey: ['email-lead-metrics'] });
      toast.success('Lead approved and enquiry created');
    },
    onError: (error: Error) => {
      toast.error(`Approval failed: ${error.message}`);
    },
  });

  const rejectLead = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase
        .from('email_leads')
        .update({ processing_status: 'rejected' })
        .eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-leads'] });
      queryClient.invalidateQueries({ queryKey: ['email-lead-metrics'] });
      toast.success('Lead rejected');
    },
  });

  // Pipeline metrics
  const { data: metrics } = useQuery({
    queryKey: ['email-lead-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_leads')
        .select('processing_status, ai_confidence');
      if (error) throw error;

      const total = data.length;
      const processed = data.filter((l: any) => l.processing_status === 'processed').length;
      const pending = data.filter((l: any) => l.processing_status === 'pending').length;
      const needsReview = data.filter((l: any) => l.processing_status === 'needs_review').length;
      const rejected = data.filter((l: any) => l.processing_status === 'rejected').length;
      const failed = data.filter((l: any) => l.processing_status === 'failed').length;
      const processing = data.filter((l: any) => l.processing_status === 'processing').length;
      const withConfidence = data.filter((l: any) => l.ai_confidence != null);
      const avgConfidence = withConfidence.length > 0
        ? withConfidence.reduce((s: number, l: any) => s + l.ai_confidence, 0) / withConfidence.length
        : 0;

      return { total, processed, pending, needsReview, rejected, failed, processing, avgConfidence };
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
    approveLead: approveLead.mutateAsync,
    approving: approveLead.isPending,
    rejectLead: rejectLead.mutateAsync,
    rejecting: rejectLead.isPending,
    metrics,
  };
}
