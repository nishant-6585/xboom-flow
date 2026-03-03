import { useState, useMemo, useCallback } from 'react';
import { addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CalendarMonthView, type CalendarMeeting } from './CalendarMonthView';
import { CalendarWeekView } from './CalendarWeekView';
import { CalendarDayView } from './CalendarDayView';
import { MeetingDetailModal } from './MeetingDetailModal';

type CalendarView = 'month' | 'week' | 'day';

interface TeamCalendarProps {
  meetings: CalendarMeeting[];
}

export function TeamCalendar({ meetings }: TeamCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>('month');
  const [selectedMeeting, setSelectedMeeting] = useState<CalendarMeeting | null>(null);

  const navigate = useCallback((direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      if (view === 'month') return direction === 'next' ? addMonths(prev, 1) : subMonths(prev, 1);
      if (view === 'week') return direction === 'next' ? addWeeks(prev, 1) : subWeeks(prev, 1);
      return direction === 'next' ? addDays(prev, 1) : subDays(prev, 1);
    });
  }, [view]);

  const goToToday = useCallback(() => setCurrentDate(new Date()), []);

  const title = useMemo(() => {
    if (view === 'month') return format(currentDate, 'MMMM yyyy');
    if (view === 'week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
      const we = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(ws, 'dd MMM')} — ${format(we, 'dd MMM yyyy')}`;
    }
    return format(currentDate, 'EEEE, dd MMMM yyyy');
  }, [currentDate, view]);

  // Filter meetings to visible date range for performance
  const visibleMeetings = useMemo(() => {
    let rangeStart: Date, rangeEnd: Date;
    if (view === 'month') {
      rangeStart = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
      rangeEnd = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    } else if (view === 'week') {
      rangeStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      rangeEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    } else {
      rangeStart = new Date(currentDate);
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = new Date(currentDate);
      rangeEnd.setHours(23, 59, 59, 999);
    }
    return meetings.filter(m => {
      const d = new Date(m.meeting_date);
      return d >= rangeStart && d <= rangeEnd;
    });
  }, [meetings, currentDate, view]);

  const handleDayClick = useCallback((date: Date) => {
    setCurrentDate(date);
    setView('day');
  }, []);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('prev')}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('next')}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-semibold ml-2">{title}</h2>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {(['day', 'week', 'month'] as CalendarView[]).map(v => (
            <Button
              key={v}
              variant={view === v ? 'default' : 'ghost'}
              size="sm"
              className="capitalize text-xs h-7 px-3"
              onClick={() => setView(v)}
            >
              {v}
            </Button>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      {view === 'month' && (
        <CalendarMonthView
          currentDate={currentDate}
          meetings={visibleMeetings}
          onMeetingClick={setSelectedMeeting}
          onDayClick={handleDayClick}
        />
      )}
      {view === 'week' && (
        <CalendarWeekView
          currentDate={currentDate}
          meetings={visibleMeetings}
          onMeetingClick={setSelectedMeeting}
        />
      )}
      {view === 'day' && (
        <CalendarDayView
          currentDate={currentDate}
          meetings={visibleMeetings}
          onMeetingClick={setSelectedMeeting}
        />
      )}

      {/* Meeting Detail Modal */}
      <MeetingDetailModal
        meeting={selectedMeeting}
        open={!!selectedMeeting}
        onOpenChange={(open) => { if (!open) setSelectedMeeting(null); }}
      />
    </div>
  );
}
