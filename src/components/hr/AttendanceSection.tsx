import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, Download, Clock, Coffee, TrendingUp, CalendarCheck } from 'lucide-react';
import { AttendanceLog } from '@/hooks/useHR';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface AttendanceSectionProps {
  todayAttendance: AttendanceLog | null;
  weeklyHours: number;
  attendanceLogs: AttendanceLog[];
  calendarMonth: Date;
  onMonthChange: (m: Date) => void;
}

const STATUS_COLORS: Record<string, string> = {
  present: 'bg-green-500',
  absent: 'bg-red-500',
  half_day: 'bg-yellow-500',
  on_leave: 'bg-purple-500',
  weekend: 'bg-muted-foreground/30',
  holiday: 'bg-blue-400',
};

const STATUS_TEXT: Record<string, string> = {
  present: 'Present',
  absent: 'Absent',
  half_day: 'Half Day',
  on_leave: 'On Leave',
  weekend: 'Weekend',
  holiday: 'Holiday',
};

function DayDetailPanel({ log, date, onClose }: { log: AttendanceLog | null; date: Date; onClose: () => void }) {
  return (
    <div className="p-4 bg-muted/30 rounded-xl mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">{format(date, 'EEEE, dd MMM yyyy')}</p>
        <div className="flex items-center gap-2">
          {log && <Badge variant="outline" className="text-xs">{STATUS_TEXT[log.status] || log.status}</Badge>}
          <button onClick={onClose} className="text-muted-foreground text-xs hover:text-foreground">✕</button>
        </div>
      </div>
      {!log ? (
        <p className="text-sm text-muted-foreground">No attendance record for this day.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Check In</p>
              <p className="font-medium">{log.check_in_time ? format(new Date(log.check_in_time), 'hh:mm a') : '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Check Out</p>
              <p className="font-medium">{log.check_out_time ? format(new Date(log.check_out_time), 'hh:mm a') : '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Work Hours</p>
              <p className="font-medium">{log.working_hours?.toFixed(1) || '0.0'}h</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Break Time</p>
              <p className="font-medium">{Math.round(log.total_break_minutes || 0)}m</p>
            </div>
          </div>
          {log.notes && <p className="text-xs text-muted-foreground">Note: {log.notes}</p>}
        </>
      )}
    </div>
  );
}

export function AttendanceSection({
  todayAttendance,
  weeklyHours,
  attendanceLogs,
  calendarMonth,
  onMonthChange,
}: AttendanceSectionProps) {
  const { role } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const isHROrAdmin = role === 'admin' || role === 'hr';

  // Status detection
  const isCheckedIn = !!todayAttendance?.check_in_time;
  const isCheckedOut = !!todayAttendance?.check_out_time;
  const isOnBreak = !!todayAttendance?.break_start_time && !todayAttendance?.break_end_time;

  const currentStatus = !isCheckedIn ? 'Not Checked In'
    : isCheckedOut ? 'Completed'
    : isOnBreak ? 'On Break'
    : 'Working';

  const statusColor = !isCheckedIn ? 'bg-red-100 text-red-700 border-red-200'
    : isCheckedOut ? 'bg-muted text-muted-foreground'
    : isOnBreak ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
    : 'bg-green-100 text-green-700 border-green-200';

  // Calendar
  const start = startOfMonth(calendarMonth);
  const end = endOfMonth(calendarMonth);
  const days = eachDayOfInterval({ start, end });
  const startPadding = getDay(start);
  const paddedDays: (Date | null)[] = [...Array(startPadding).fill(null), ...days];

  const getLogForDate = (date: Date): AttendanceLog | undefined => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return attendanceLogs.find(l => l.date === dateStr);
  };

  const selectedLog = selectedDate ? getLogForDate(selectedDate) || null : null;

  // Monthly stats
  const presentDays = attendanceLogs.filter(l => l.status === 'present').length;
  const totalWorkHours = attendanceLogs.reduce((s, l) => s + (l.working_hours || 0), 0);

  // CSV Export
  const exportCSV = () => {
    const headers = ['Date', 'Status', 'Check In', 'Check Out', 'Work Hours', 'Break (min)', 'Notes'];
    const rows = attendanceLogs.map(l => [
      l.date,
      l.status,
      l.check_in_time ? format(new Date(l.check_in_time), 'HH:mm') : '',
      l.check_out_time ? format(new Date(l.check_out_time), 'HH:mm') : '',
      l.working_hours?.toFixed(2) || '0',
      Math.round(l.total_break_minutes || 0).toString(),
      l.notes || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${format(calendarMonth, 'yyyy-MM')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Top Summary Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-4 flex items-center gap-3">
            <div className={cn('w-3 h-3 rounded-full shrink-0', !isCheckedIn ? 'bg-red-500' : isCheckedOut ? 'bg-muted-foreground' : isOnBreak ? 'bg-yellow-500 animate-pulse' : 'bg-green-500 animate-pulse')} />
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="font-semibold text-sm">{currentStatus}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Today</p>
              <p className="font-semibold text-sm">{(todayAttendance?.working_hours || 0).toFixed(1)}h</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">This Week</p>
              <p className="font-semibold text-sm">{weeklyHours.toFixed(1)}h</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CalendarCheck className="h-5 w-5 text-blue-600 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">This Month</p>
              <p className="font-semibold text-sm">{presentDays}d · {totalWorkHours.toFixed(0)}h</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Compact Calendar */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMonthChange(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-sm font-semibold">{format(calendarMonth, 'MMMM yyyy')}</CardTitle>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMonthChange(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {isHROrAdmin && (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={exportCSV}>
                <Download className="h-3 w-3" />
                Export CSV
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-0.5">
            {paddedDays.map((day, idx) => {
              if (!day) return <div key={`pad-${idx}`} className="aspect-square" />;
              const log = getLogForDate(day);
              const isWknd = getDay(day) === 0 || getDay(day) === 6;
              const isSelected = selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(isSelected ? null : day)}
                  className={cn(
                    'aspect-square flex flex-col items-center justify-center rounded text-xs transition-colors relative',
                    isToday(day) && 'ring-1 ring-primary',
                    isSelected && 'bg-primary/10',
                    !isWknd && 'hover:bg-muted/60 cursor-pointer',
                    isWknd && 'cursor-default',
                    !isSameMonth(day, calendarMonth) && 'opacity-30',
                  )}
                >
                  <span className={cn('text-xs', isWknd && 'text-muted-foreground', isToday(day) && 'font-bold text-primary')}>
                    {format(day, 'd')}
                  </span>
                  {log && (
                    <div className={cn('w-1.5 h-1.5 rounded-full mt-0.5', STATUS_COLORS[log.status] || 'bg-muted-foreground/40')} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t">
            {[['present', 'bg-green-500', 'Present'], ['absent', 'bg-red-500', 'Absent'], ['on_leave', 'bg-purple-500', 'Leave'], ['half_day', 'bg-yellow-500', 'Half Day']].map(([, color, label]) => (
              <div key={label} className="flex items-center gap-1 text-xs text-muted-foreground">
                <div className={cn('w-2 h-2 rounded-full', color)} />
                <span>{label}</span>
              </div>
            ))}
          </div>

          {/* Selected day detail */}
          {selectedDate && (
            <DayDetailPanel log={selectedLog} date={selectedDate} onClose={() => setSelectedDate(null)} />
          )}
        </CardContent>
      </Card>

      {/* Recent logs (last 5) */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Recent Logs</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {attendanceLogs.slice(0, 5).map(log => (
            <div key={log.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div>
                <p className="text-sm font-medium">{log.date}</p>
                <p className="text-xs text-muted-foreground">
                  {log.check_in_time ? format(new Date(log.check_in_time), 'hh:mm a') : '--:--'}
                  {' → '}
                  {log.check_out_time ? format(new Date(log.check_out_time), 'hh:mm a') : '--:--'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {log.total_break_minutes ? (
                  <span className="text-xs text-yellow-600">{Math.round(log.total_break_minutes)}m break</span>
                ) : null}
                <span className="font-medium text-sm">{(log.working_hours || 0).toFixed(1)}h</span>
                <div className={cn('w-2 h-2 rounded-full', STATUS_COLORS[log.status] || 'bg-muted')} />
              </div>
            </div>
          ))}
          {attendanceLogs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No attendance records this month</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
