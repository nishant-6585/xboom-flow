import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export interface CallAiAnalysis {
  id: string;
  call_log_id: string;
  transcript: string | null;
  intent: string | null;
  budget: string | null;
  timeline: string | null;
  key_requirements: string[] | null;
  objections: string[] | null;
  sentiment: string | null;
  summary: string | null;
  next_action: string | null;
  confidence_score: number | null;
  created_at: string;
}

export interface CallLogWithAnalysis {
  id: string;
  caller_number: string;
  customer_name: string | null;
  customer_company: string | null;
  product_name: string | null;
  call_status: string;
  call_type: string | null;
  call_duration: number | null;
  recording_url: string | null;
  recording_stream_url: string | null;
  exotel_call_sid: string | null;
  sales_person_name: string | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  notes: string | null;
  lead_id: string | null;
}

export function useCallIntelligence(leadId?: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch call logs for a specific lead
  const { data: callLogs = [], isLoading: loadingCalls } = useQuery({
    queryKey: ['call_logs_by_lead', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from('call_logs')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as CallLogWithAnalysis[];
    },
    enabled: !!user && !!leadId,
  });

  // Fetch AI analysis for specific call
  const fetchAnalysis = async (callLogId: string): Promise<CallAiAnalysis | null> => {
    const { data, error } = await supabase
      .from('call_ai_analysis')
      .select('*')
      .eq('call_log_id', callLogId)
      .maybeSingle();
    if (error) {
      console.error('Error fetching analysis:', error);
      return null;
    }
    return data as unknown as CallAiAnalysis | null;
  };

  // Initiate a call via Exotel
  const initiateCall = async (phoneNumber: string, leadIdParam?: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const { data, error } = await supabase.functions.invoke('exotel-call-initiate', {
        body: {
          phone_number: phoneNumber,
          lead_id: leadIdParam || leadId,
          salesperson_id: user.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      queryClient.invalidateQueries({ queryKey: ['call_logs_by_lead', leadId] });
      toast.success('Call initiated! 📞');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to initiate call');
      return false;
    }
  };

  // Trigger AI analysis for a call
  const triggerAnalysis = async (callLogId: string, recordingUrl?: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('ai-call-analysis', {
        body: { call_log_id: callLogId, recording_url: recordingUrl },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast.success('AI analysis completed! 🤖');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to analyze call');
      return false;
    }
  };

  return {
    callLogs,
    loadingCalls,
    fetchAnalysis,
    initiateCall,
    triggerAnalysis,
    refetchCalls: () => queryClient.invalidateQueries({ queryKey: ['call_logs_by_lead', leadId] }),
  };
}
