import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type MeetingType = 'discovery' | 'pricing' | 'negotiation' | 'closing' | 'internal';
export type MeetingStatus = 'requested' | 'scheduled' | 'done' | 'cancelled';
export type MeetingOutcome = 'pursued' | 'deal_closed' | 'deal_lost';

export interface Meeting {
  id: string;
  title: string | null;
  description: string | null;
  enquiry_id: string | null;
  pipeline_id: string | null;
  order_id: string | null;
  meeting_date: string;
  end_datetime: string | null;
  meeting_type: MeetingType;
  agenda: string | null;
  background: string | null;
  participants: string[];
  owner_id: string;
  owner_name: string;
  host_id: string | null;
  host_name: string | null;
  status: MeetingStatus;
  outcome: string | null;
  meeting_outcome: MeetingOutcome | null;
  next_steps: string | null;
  next_followup_date: string | null;
  meeting_link: string | null;
  visibility: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  lead_customer_name?: string;
  lead_customer_company?: string;
  lead_product_name?: string;
  lead_status?: string;
  // Resolved participant names
  participant_names?: string[];
}

export interface MeetingFormData {
  title?: string;
  description?: string;
  enquiry_id?: string;
  pipeline_id?: string;
  order_id?: string;
  meeting_date: string;
  end_datetime?: string;
  meeting_type: MeetingType;
  agenda?: string;
  background?: string;
  participants?: string[];
  host_id?: string;
  host_name?: string;
  status?: MeetingStatus;
  meeting_link?: string;
  meeting_outcome?: MeetingOutcome;
  visibility?: string;
}

export const MEETING_TYPES: { value: MeetingType; label: string }[] = [
  { value: 'discovery', label: 'Discovery' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'closing', label: 'Closing' },
  { value: 'internal', label: 'Internal' },
];

export const MEETING_STATUSES: { value: MeetingStatus; label: string; color: string }[] = [
  { value: 'requested', label: 'Requested', color: 'bg-blue-500' },
  { value: 'scheduled', label: 'Scheduled', color: 'bg-yellow-500' },
  { value: 'done', label: 'Done', color: 'bg-green-500' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-500' },
];

export const MEETING_OUTCOMES: { value: MeetingOutcome; label: string; color: string }[] = [
  { value: 'pursued', label: 'Being Pursued', color: 'bg-blue-500' },
  { value: 'deal_closed', label: 'Deal Closed', color: 'bg-green-500' },
  { value: 'deal_lost', label: 'Deal Lost', color: 'bg-red-500' },
];

export function useMeetings() {
  const { user, profile } = useAuth();
  // Depend on user.id (stable primitive), not user object — see usePricelist.
  const userId = user?.id ?? null;
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMeetings = useCallback(async () => {
    if (!userId) return;

    try {
      // Use raw query since meetings table is new
      const { data, error } = await supabase
        .from('meetings' as any)
        .select(`
          *,
          enquiries:enquiry_id(customer_name, customer_company, product_name, status),
          pipeline_orders:pipeline_id(customer_name, customer_company, product_name, status)
        `)
        .order('meeting_date', { ascending: true });

      if (error) throw error;

      // Transform data to include lead info
      const transformedMeetings = ((data as any[]) || []).map((meeting: any) => {
        const lead = meeting.enquiries || meeting.pipeline_orders;
        return {
          ...meeting,
          lead_customer_name: lead?.customer_name,
          lead_customer_company: lead?.customer_company,
          lead_product_name: lead?.product_name,
          lead_status: lead?.status,
        };
      });

      setMeetings(transformedMeetings);
    } catch (error: any) {
      console.error('Error fetching meetings:', error);
      toast.error('Failed to fetch meetings');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('meetings_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meetings' },
        () => fetchMeetings()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMeetings]);

  const createMeeting = async (formData: MeetingFormData): Promise<boolean> => {
    if (!user || !profile) return false;

    try {
      const { error } = await supabase.from('meetings' as any).insert({
        ...formData,
        owner_id: user.id,
        owner_name: profile.name,
        participants: formData.participants || [],
        status: formData.status || 'requested',
      } as any);

      if (error) throw error;
      toast.success('Meeting created successfully');
      return true;
    } catch (error: any) {
      console.error('Error creating meeting:', error);
      toast.error(error.message || 'Failed to create meeting');
      return false;
    }
  };

  const updateMeeting = async (id: string, updates: Partial<Meeting>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('meetings' as any)
        .update(updates as any)
        .eq('id', id);

      if (error) throw error;
      toast.success('Meeting updated successfully');
      return true;
    } catch (error: any) {
      console.error('Error updating meeting:', error);
      toast.error(error.message || 'Failed to update meeting');
      return false;
    }
  };

  const deleteMeeting = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('meetings' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Meeting deleted successfully');
      return true;
    } catch (error: any) {
      console.error('Error deleting meeting:', error);
      toast.error(error.message || 'Failed to delete meeting');
      return false;
    }
  };

  // Request meeting for a lead
  const requestMeeting = async (
    leadType: 'enquiry' | 'pipeline' | 'order',
    leadId: string,
    meetingDate: string,
    meetingType: MeetingType,
    agenda?: string
  ): Promise<boolean> => {
    return createMeeting({
      enquiry_id: leadType === 'enquiry' ? leadId : undefined,
      pipeline_id: leadType === 'pipeline' ? leadId : undefined,
      order_id: leadType === 'order' ? leadId : undefined,
      meeting_date: meetingDate,
      meeting_type: meetingType,
      agenda,
      status: 'requested',
    });
  };

  // Filter helpers
  const upcomingMeetings = meetings.filter(m => 
    m.status === 'scheduled' && new Date(m.meeting_date) > new Date()
  );
  const todaysMeetings = meetings.filter(m => {
    const meetingDate = new Date(m.meeting_date);
    const today = new Date();
    return meetingDate.toDateString() === today.toDateString() && m.status !== 'cancelled';
  });
  const closedLeadMeetings = meetings.filter(m => 
    m.lead_status && ['order_won', 'order_lost', 'won', 'lost'].includes(m.lead_status) &&
    ['scheduled', 'done'].includes(m.status)
  );

  // Monthly stats
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const meetingsThisMonth = meetings.filter(m => {
    const meetingDate = new Date(m.meeting_date);
    return meetingDate.getMonth() === currentMonth && 
           meetingDate.getFullYear() === currentYear &&
           ['scheduled', 'done'].includes(m.status);
  }).length;

  return {
    meetings,
    upcomingMeetings,
    todaysMeetings,
    closedLeadMeetings,
    meetingsThisMonth,
    loading,
    createMeeting,
    updateMeeting,
    deleteMeeting,
    requestMeeting,
    refetch: fetchMeetings,
  };
}
