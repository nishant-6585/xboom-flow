import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, Users, User, ExternalLink, Video, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { MEETING_TYPES, MEETING_STATUSES } from '@/hooks/useMeetings';
import type { CalendarMeeting } from './CalendarMonthView';

interface MeetingDetailModalProps {
  meeting: CalendarMeeting | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusColors: Record<string, string> = {
  requested: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  scheduled: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  done: 'bg-green-500/20 text-green-700 dark:text-green-400',
  cancelled: 'bg-red-500/20 text-red-700 dark:text-red-400',
};

export function MeetingDetailModal({ meeting, open, onOpenChange }: MeetingDetailModalProps) {
  if (!meeting) return null;

  const meetingDate = new Date(meeting.meeting_date);
  const endDate = meeting.end_datetime ? new Date(meeting.end_datetime) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-8">{meeting.title || 'Meeting'}</DialogTitle>
          <DialogDescription className="flex items-center gap-2 pt-1">
            <Badge className={statusColors[meeting.status] || 'bg-muted'}>
              {MEETING_STATUSES.find(s => s.value === meeting.status)?.label || meeting.status}
            </Badge>
            <Badge variant="outline">
              {MEETING_TYPES.find(t => t.value === meeting.meeting_type)?.label || meeting.meeting_type}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date & Time */}
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>{format(meetingDate, 'EEEE, dd MMM yyyy')}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>
              {format(meetingDate, 'h:mm a')}
              {endDate && ` — ${format(endDate, 'h:mm a')}`}
            </span>
          </div>

          {/* Host */}
          {meeting.host_name && (
            <div className="flex items-center gap-3 text-sm">
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>Host: <strong>{meeting.host_name}</strong></span>
            </div>
          )}

          {/* Participants */}
          {meeting.participant_names && meeting.participant_names.length > 0 && (
            <div className="flex items-start gap-3 text-sm">
              <Users className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <div className="font-medium mb-1">Participants</div>
                <div className="flex flex-wrap gap-1">
                  {meeting.participant_names.map((name, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{name}</Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Meeting Link */}
          {meeting.meeting_link && (
            <Button
              variant="outline"
              className="w-full"
              asChild
            >
              <a href={meeting.meeting_link} target="_blank" rel="noopener noreferrer">
                <Video className="w-4 h-4 mr-2" />
                Join Meeting
                <ExternalLink className="w-3 h-3 ml-auto" />
              </a>
            </Button>
          )}

          {/* Description / Agenda */}
          {(meeting.description || meeting.agenda) && (
            <div className="border-t pt-3">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {meeting.description ? 'Description' : 'Agenda'}
              </div>
              <p className="text-sm whitespace-pre-wrap">
                {meeting.description || meeting.agenda}
              </p>
            </div>
          )}

          {/* Visibility */}
          <div className="border-t pt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            Visibility: <Badge variant="outline" className="text-[10px]">{meeting.visibility || 'team'}</Badge>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
