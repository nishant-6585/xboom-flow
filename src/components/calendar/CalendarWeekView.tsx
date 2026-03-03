import { useMemo } from 'react';
import { startOfWeek, addDays, format, isToday, isSameDay, isPast } from 'date-fns';
import { cn } from '@/lib/utils';
import type { CalendarMeeting } from './CalendarMonthView';

interface CalendarWeekViewProps {
  currentDate: Date;
  meetings: CalendarMeeting[];
  onMeetingClick: (meeting: CalendarMeeting) => void;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am - 8pm

const TYPE_COLORS: Record<string, string> = {
  discovery: 'bg-purple-500/80 border-purple-600',
  pricing: 'bg-indigo-500/80 border-indigo-600',
  negotiation: 'bg-orange-500/80 border-orange-600',
  closing: 'bg-green-600/80 border-green-700',
  internal: 'bg-muted-foreground/60 border-muted-foreground',
};

export function CalendarWeekView({ currentDate, meetings, onMeetingClick }: CalendarWeekViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const meetingsByDay = useMemo(() => {
    const map = new Map<string, CalendarMeeting[]>();
    meetings.forEach(m => {
      const key = format(new Date(m.meeting_date), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    return map;
  }, [meetings]);

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
        <div className="p-2 border-r" />
        {weekDays.map((day, i) => (
          <div key={i} className={cn(
            'p-2 text-center border-r last:border-r-0',
            isToday(day) && 'bg-primary/10',
          )}>
            <div className="text-xs text-muted-foreground">{format(day, 'EEE')}</div>
            <div className={cn(
              'text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mx-auto',
              isToday(day) && 'bg-primary text-primary-foreground',
            )}>
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>
      {/* Time grid */}
      <div className="overflow-y-auto max-h-[600px]">
        {HOURS.map(hour => (
          <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b min-h-[60px]">
            <div className="p-1 text-[10px] text-muted-foreground text-right pr-2 border-r">
              {format(new Date(2000, 0, 1, hour), 'h a')}
            </div>
            {weekDays.map((day, di) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayMeetings = (meetingsByDay.get(key) || []).filter(m => {
                const h = new Date(m.meeting_date).getHours();
                return h === hour;
              });
              return (
                <div key={di} className={cn(
                  'border-r last:border-r-0 p-0.5 relative',
                  isToday(day) && 'bg-primary/5',
                )}>
                  {dayMeetings.map(m => (
                    <button
                      key={m.id}
                      onClick={() => onMeetingClick(m)}
                      className={cn(
                        'w-full text-left text-[10px] text-white px-1 py-0.5 rounded border-l-2 truncate block mb-0.5',
                        TYPE_COLORS[m.meeting_type] || 'bg-primary/70 border-primary',
                        m.status === 'cancelled' && 'line-through opacity-50',
                        isPast(new Date(m.end_datetime || m.meeting_date)) && m.status !== 'cancelled' && 'opacity-60',
                      )}
                    >
                      {format(new Date(m.meeting_date), 'HH:mm')} {m.title || 'Meeting'}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
