import { useMemo } from 'react';
import { format, isToday, isPast, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';
import type { CalendarMeeting } from './CalendarMonthView';

interface CalendarDayViewProps {
  currentDate: Date;
  meetings: CalendarMeeting[];
  onMeetingClick: (meeting: CalendarMeeting) => void;
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6am - 9pm

const TYPE_COLORS: Record<string, string> = {
  discovery: 'bg-purple-500/80 border-purple-600',
  pricing: 'bg-indigo-500/80 border-indigo-600',
  negotiation: 'bg-orange-500/80 border-orange-600',
  closing: 'bg-green-600/80 border-green-700',
  internal: 'bg-muted-foreground/60 border-muted-foreground',
};

export function CalendarDayView({ currentDate, meetings, onMeetingClick }: CalendarDayViewProps) {
  const dayMeetings = useMemo(() =>
    meetings.filter(m => isSameDay(new Date(m.meeting_date), currentDate))
      .sort((a, b) => new Date(a.meeting_date).getTime() - new Date(b.meeting_date).getTime()),
    [meetings, currentDate]
  );

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="p-3 border-b flex items-center gap-3">
        <div className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold',
          isToday(currentDate) ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}>
          {format(currentDate, 'd')}
        </div>
        <div>
          <div className="font-medium">{format(currentDate, 'EEEE')}</div>
          <div className="text-sm text-muted-foreground">{format(currentDate, 'MMMM yyyy')}</div>
        </div>
        <div className="ml-auto text-sm text-muted-foreground">
          {dayMeetings.length} meeting{dayMeetings.length !== 1 ? 's' : ''}
        </div>
      </div>
      {/* Time grid */}
      <div className="overflow-y-auto max-h-[600px]">
        {HOURS.map(hour => {
          const hourMeetings = dayMeetings.filter(m => new Date(m.meeting_date).getHours() === hour);
          return (
            <div key={hour} className="grid grid-cols-[80px_1fr] border-b min-h-[60px]">
              <div className="p-2 text-xs text-muted-foreground text-right pr-3 border-r">
                {format(new Date(2000, 0, 1, hour), 'h:mm a')}
              </div>
              <div className="p-1 space-y-1">
                {hourMeetings.map(m => (
                  <button
                    key={m.id}
                    onClick={() => onMeetingClick(m)}
                    className={cn(
                      'w-full text-left text-sm text-white px-3 py-2 rounded border-l-3 flex items-center gap-2',
                      TYPE_COLORS[m.meeting_type] || 'bg-primary/70 border-primary',
                      m.status === 'cancelled' && 'line-through opacity-50',
                      isPast(new Date(m.end_datetime || m.meeting_date)) && m.status !== 'cancelled' && 'opacity-60',
                    )}
                  >
                    <span className="font-medium">
                      {format(new Date(m.meeting_date), 'HH:mm')}
                      {m.end_datetime && ` - ${format(new Date(m.end_datetime), 'HH:mm')}`}
                    </span>
                    <span className="truncate">{m.title || 'Meeting'}</span>
                    {m.meeting_link && <span className="text-[10px] opacity-80">📹</span>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
