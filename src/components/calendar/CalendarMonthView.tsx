import { useMemo } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday, isSameDay, isPast
} from 'date-fns';
import { cn } from '@/lib/utils';

export interface CalendarMeeting {
  id: string;
  title: string;
  meeting_date: string;
  end_datetime: string | null;
  meeting_type: string;
  status: string;
  meeting_link: string | null;
  host_name: string | null;
  owner_name: string;
  visibility: string;
  agenda: string | null;
  description: string | null;
  participants: string[];
  participant_names?: string[];
}

interface CalendarMonthViewProps {
  currentDate: Date;
  meetings: CalendarMeeting[];
  onMeetingClick: (meeting: CalendarMeeting) => void;
  onDayClick: (date: Date) => void;
}

const TYPE_COLORS: Record<string, string> = {
  discovery: 'bg-purple-500/80 text-white',
  pricing: 'bg-indigo-500/80 text-white',
  negotiation: 'bg-orange-500/80 text-white',
  closing: 'bg-green-600/80 text-white',
  internal: 'bg-muted-foreground/60 text-white',
};

export function CalendarMonthView({ currentDate, meetings, onMeetingClick, onDayClick }: CalendarMonthViewProps) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentDate]);

  const meetingsByDay = useMemo(() => {
    const map = new Map<string, CalendarMeeting[]>();
    meetings.forEach(m => {
      const key = format(new Date(m.meeting_date), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    return map;
  }, [meetings]);

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {/* Header row */}
      <div className="grid grid-cols-7 border-b">
        {weekdays.map(d => (
          <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground border-r last:border-r-0">
            {d}
          </div>
        ))}
      </div>
      {/* Day grid */}
      <div className="grid grid-cols-7 auto-rows-fr" style={{ minHeight: '480px' }}>
        {days.map((day, i) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayMeetings = meetingsByDay.get(key) || [];
          const inMonth = isSameMonth(day, currentDate);
          const today = isToday(day);
          return (
            <div
              key={i}
              className={cn(
                'border-r border-b last:border-r-0 p-1 min-h-[80px] cursor-pointer hover:bg-accent/30 transition-colors',
                !inMonth && 'bg-muted/30',
              )}
              onClick={() => onDayClick(day)}
            >
              <div className={cn(
                'text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                today && 'bg-primary text-primary-foreground',
                !inMonth && 'text-muted-foreground/50',
              )}>
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {dayMeetings.slice(0, 3).map(m => {
                  const meetingPast = isPast(new Date(m.end_datetime || m.meeting_date)) && m.status !== 'done';
                  return (
                    <button
                      key={m.id}
                      onClick={(e) => { e.stopPropagation(); onMeetingClick(m); }}
                      className={cn(
                        'w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded truncate block',
                        TYPE_COLORS[m.meeting_type] || 'bg-primary/70 text-primary-foreground',
                        m.status === 'cancelled' && 'line-through opacity-50',
                        meetingPast && m.status !== 'cancelled' && 'opacity-60',
                      )}
                    >
                      {format(new Date(m.meeting_date), 'HH:mm')} {m.title || 'Meeting'}
                    </button>
                  );
                })}
                {dayMeetings.length > 3 && (
                  <div className="text-[10px] text-muted-foreground pl-1">
                    +{dayMeetings.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
