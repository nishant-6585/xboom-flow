import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Users, Video, User, Target } from "lucide-react";
import { format } from "date-fns";
import { MEETING_TYPES, MEETING_STATUSES, MEETING_OUTCOMES, MeetingType, MeetingStatus, MeetingOutcome } from "@/hooks/useMeetings";

interface LeadMeeting {
  id: string;
  meeting_date: string;
  meeting_type: MeetingType;
  status: MeetingStatus;
  meeting_outcome: MeetingOutcome | null;
  agenda: string | null;
  host_name: string | null;
  owner_name: string;
  meeting_link: string | null;
  participants: string[];
}

interface LeadMeetingsPanelProps {
  leadType: 'enquiry' | 'pipeline' | 'order';
  leadId: string;
}

export function LeadMeetingsPanel({ leadType, leadId }: LeadMeetingsPanelProps) {
  const [meetings, setMeetings] = useState<LeadMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchMeetings = async () => {
      try {
        setLoading(true);
        const column = leadType === 'enquiry' ? 'enquiry_id' : 
                       leadType === 'pipeline' ? 'pipeline_id' : 'order_id';
        
        const { data, error } = await supabase
          .from('meetings' as any)
          .select('id, meeting_date, meeting_type, status, meeting_outcome, agenda, host_name, owner_name, meeting_link, participants')
          .eq(column, leadId)
          .order('meeting_date', { ascending: false });

        if (error) throw error;
        setMeetings((data as unknown as LeadMeeting[]) || []);

        // Fetch participant names
        const allParticipantIds = (data || []).flatMap((m: any) => m.participants || []);
        const uniqueIds = [...new Set(allParticipantIds)].filter(Boolean);
        
        if (uniqueIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, name')
            .in('user_id', uniqueIds);
          
          const nameMap: Record<string, string> = {};
          profiles?.forEach((p: any) => {
            nameMap[p.user_id] = p.name;
          });
          setParticipantNames(nameMap);
        }
      } catch (error) {
        console.error('Error fetching lead meetings:', error);
      } finally {
        setLoading(false);
      }
    };

    if (leadId) {
      fetchMeetings();
    }
  }, [leadId, leadType]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Meetings
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2">
          <p className="text-sm text-muted-foreground">Loading meetings...</p>
        </CardContent>
      </Card>
    );
  }

  if (meetings.length === 0) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Meetings
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2">
          <p className="text-sm text-muted-foreground">No meetings scheduled for this lead.</p>
        </CardContent>
      </Card>
    );
  }

  const getStatusColor = (status: MeetingStatus) => {
    switch (status) {
      case 'requested': return 'bg-blue-500/20 text-blue-700 dark:text-blue-400';
      case 'scheduled': return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400';
      case 'done': return 'bg-green-500/20 text-green-700 dark:text-green-400';
      case 'cancelled': return 'bg-red-500/20 text-red-700 dark:text-red-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getOutcomeColor = (outcome: MeetingOutcome | null) => {
    switch (outcome) {
      case 'pursued': return 'bg-blue-500/20 text-blue-700 dark:text-blue-400';
      case 'deal_closed': return 'bg-green-500/20 text-green-700 dark:text-green-400';
      case 'deal_lost': return 'bg-red-500/20 text-red-700 dark:text-red-400';
      default: return '';
    }
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Meetings ({meetings.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2 space-y-3">
        {meetings.map((meeting) => (
          <div key={meeting.id} className="p-3 rounded-lg bg-secondary/50 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Badge className={getStatusColor(meeting.status)}>
                  {MEETING_STATUSES.find(s => s.value === meeting.status)?.label}
                </Badge>
                <Badge variant="outline">
                  {MEETING_TYPES.find(t => t.value === meeting.meeting_type)?.label}
                </Badge>
              </div>
              {meeting.meeting_outcome && (
                <Badge className={getOutcomeColor(meeting.meeting_outcome)}>
                  <Target className="w-3 h-3 mr-1" />
                  {MEETING_OUTCOMES.find(o => o.value === meeting.meeting_outcome)?.label}
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-muted-foreground" />
                <span>{format(new Date(meeting.meeting_date), 'dd MMM yyyy')}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span>{format(new Date(meeting.meeting_date), 'h:mm a')}</span>
              </div>
            </div>

            {meeting.host_name && (
              <div className="flex items-center gap-2 text-sm">
                <User className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">Host:</span>
                <span>{meeting.host_name}</span>
              </div>
            )}

            {meeting.participants && meeting.participants.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <Users className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">Participants:</span>
                <span>{meeting.participants.map(p => participantNames[p] || p).join(', ')}</span>
              </div>
            )}

            {meeting.agenda && (
              <p className="text-xs text-muted-foreground line-clamp-2">{meeting.agenda}</p>
            )}

            {meeting.meeting_link && (
              <a 
                href={meeting.meeting_link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Video className="w-3 h-3" />
                Join Meeting
              </a>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
