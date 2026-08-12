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

/**
 * Columns fetched for the list view. `body_html` / `body_text` are deliberately
 * excluded — they account for ~95% of the table payload and are only needed when
 * a single lead is opened (see useEmailLeadBody).
 */
const LIST_COLUMNS = [
  'id', 'customer_name', 'customer_company', 'phone_number', 'email', 'city',
  'product_name', 'product_code', 'product_category', 'quantity', 'lead_source',
  'mail_source', 'urgency', 'requested_timeline', 'purpose_of_purchase', 'notes',
  'subject', 'status', 'sales_person_id', 'sales_person_name', 'is_prospect',
  'is_a_category', 'created_by', 'created_by_name', 'updated_by',
  'processing_status', 'ai_processed', 'error_message', 'ai_confidence',
  'ai_extracted_json', 'retry_count', 'email_lead_id', 'thread_id',
  'ingested_at', 'processed_at', 'last_error', 'created_at', 'updated_at',
  'disposition', 'disposition_reason_code', 'disposition_reason_note',
  'disposition_at', 'disposition_by_name', 'customer_type',
  'is_enquiry_converted',
].join(', ');

const sel = (s: string): string => s;

/** Lazily loads the heavy email body for a single lead. */
export function useEmailLeadBody(leadId: string | null | undefined) {
  return useQuery({
    queryKey: ['email-lead-body', leadId],
    enabled: !!leadId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_leads')
        .select(sel('id, body_text, body_html'))
        .eq('id', leadId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as { id: string; body_text: string | null; body_html: string | null } | null;
    },
  });
}

export function useEmailLeads() {
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['email-leads'],
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_leads')
        .select(sel(LIST_COLUMNS))
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
      return { id, updates };
    },
    // Optimistically patch the cached row so the table reflects the edit instantly.
    onMutate: async (lead) => {
      const key = ['email-leads'];
      const previous = queryClient.getQueryData<EmailLead[]>(key);
      queryClient.setQueryData<EmailLead[]>(key, (old) =>
        (old || []).map((l) => (l.id === lead.id ? { ...l, ...lead } : l)),
      );
      return { previous };
    },
    onSuccess: () => {
      toast.success('Email lead updated successfully');
    },
    onError: (error: Error, _vars, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(['email-leads'], ctx.previous);
      toast.error(`Update failed: ${error.message}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['email-leads'] });
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
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_leads')
        .select(sel('processing_status, ai_confidence'));
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
