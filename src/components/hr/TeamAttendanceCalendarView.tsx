import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isFuture, isToday, isWeekend } from 'date-fns';
import { ChevronLeft, ChevronRight, Users, UserCheck, UserX, CalendarCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useHolidays } from '@/hooks/useHolidays';
import { cn } from '@/lib/utils';

interface DaySummary {
  present: number;
  absent: number;
  onLeave: number;
  halfDay: number;
  total: number;
}

interface TeamAttendanceCalendarViewProps {
  totalEmployees: number;
  onDateSelect?: (date: Date) => void;
}

export function TeamAttendanceCalendarView({ totalEmployees, onDateSelect }: TeamAttendanceCalendarViewProps) {
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [monthLogs, setMonthLogs] = useState<Record<string, DaySummary>>({});
  const [monthLeaves, setMonthLeaves] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const { isHoliday, getHoliday } = useHolidays(calendarMonth.getFullYear());

  const monthStart = startOfMonth(calendarMonth);
  const monthEnd = endOfMonth(calendarMonth);
  const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart);
  const paddedDays: (Date | null)[] = Array(startPadding).fill(null).concat(allDays);

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i);

  const fetchMonthData = useCallback(async () => {
    setLoading(true);
    const startStr = format(monthStart, 'yyyy-MM-dd');
    const endStr = format(monthEnd, 'yyyy-MM-dd');

    const [logsRes, leavesRes] = await Promise.all([
      supabase.from('attendance_logs').select('date, status, working_hours').gte('date', startStr).lte('date', endStr),
      supabase.from('leave_requests').select('employee_id, start_date, end_date').eq('status', 'approved').lte('start_date', endStr).gte('end_date', startStr),
    ]);

    // Aggregate logs by date
    const summaryMap: Record<string, DaySummary> = {};
    (logsRes.data || []).forEach((log: any) => {
      if (!summaryMap[log.date]) summaryMap[log.date] = { present: 0, absent: 0, onLeave: 0, halfDay: 0, total: 0 };
      summaryMap[log.date].total++;
      if (log.status === 'present') summaryMap[log.date].present++;
      else if (log.status === 'on_leave') summaryMap[log.date].onLeave++;
      else if (log.status === 'half_day') summaryMap[log.date].halfDay++;
      else if (log.status === 'absent') summaryMap[log.date].absent++;
    });
    setMonthLogs(summaryMap);

    // Count leaves per date
    const leaveMap: Record<string, number> = {};
    (leavesRes.data || []).forEach((l: any) => {
      for (const day of allDays) {
        const ds = format(day, 'yyyy-MM-dd');
        if (ds >= l.start_date && ds <= l.end_date) {
          leaveMap[ds] = (leaveMap[ds] || 0) + 1;
        }
      }
    });
    setMonthLeaves(leaveMap);
    setLoading(false);
  }, [calendarMonth]);

  useEffect(() => { fetchMonthData(); }, [fetchMonthData]);

  const getDayInfo = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const summary = monthLogs[dateStr];
    const leaveCount = monthLeaves[dateStr] || 0;
    const holiday = getHoliday(dateStr);
    const isWeekendDay = isWeekend(day);
    const dayIsFuture = isFuture(day) && !isToday(day);
    const isTodayDay = isToday(day);

    const present = (summary?.present || 0) + (summary?.halfDay || 0);
    const onLeave = (summary?.onLeave || 0) + leaveCount;
    const absent = dayIsFuture || isWeekendDay || holiday ? 0 : Math.max(0, totalEmployees - present - onLeave);

    let bgColor = '';
    if (dayIsFuture) bgColor = '';
    else if (holiday) bgColor = 'bg-blue-50 dark:bg-blue-950/20';
    else if (isWeekendDay) bgColor = 'bg-muted/30';
    else if (present > 0) {
      const ratio = present / totalEmployees;
      if (ratio >= 0.8) bgColor = 'bg-green-100 dark:bg-green-950/30';
      else if (ratio >= 0.5) bgColor = 'bg-yellow-50 dark:bg-yellow-950/20';
      else bgColor = 'bg-red-50 dark:bg-red-950/20';
    }

    return { dateStr, summary, present, onLeave, absent, holiday, isWeekendDay, dayIsFuture, isTodayDay, bgColor };
  };

  return (
    <Card>
      <CardContent className="p-4">
        {/* Month/Year navigation */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Select value={calendarMonth.getMonth().toString()} onValueChange={v => setCalendarMonth(new Date(calendarMonth.getFullYear(), parseInt(v), 1))}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={calendarMonth.getFullYear().toString()} onValueChange={v => setCalendarMonth(new Date(parseInt(v), calendarMonth.getMonth(), 1))}>
              <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCalendarMonth(new Date())}>Today</Button>
        </div>

        {/* Calendar Grid */}
        <div className={cn('grid grid-cols-7 gap-0 border rounded-lg overflow-hidden', loading && 'opacity-50')}>
          {/* Header */}
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2 bg-muted/40 border-b">
              {d}
            </div>
          ))}
          {/* Days */}
          {paddedDays.map((day, idx) => {
            if (!day) return <div key={`pad-${idx}`} className="min-h-[72px] border-b border-r bg-muted/10" />;

            const info = getDayInfo(day);

            return (
              <Tooltip key={day.toISOString()}>
                <TooltipTrigger asChild>
                  <button
                    className={cn(
                      'min-h-[72px] border-b border-r p-1.5 text-left transition-colors relative flex flex-col',
                      info.bgColor || 'hover:bg-muted/30',
                      info.isTodayDay && 'ring-2 ring-inset ring-primary',
                      info.dayIsFuture && 'opacity-50 cursor-default',
                      !info.dayIsFuture && onDateSelect && 'cursor-pointer',
                    )}
                    onClick={() => !info.dayIsFuture && onDateSelect?.(day)}
                    disabled={info.dayIsFuture}
                  >
                    <span className={cn(
                      'text-sm font-medium',
                      info.isWeekendDay && 'text-muted-foreground/60',
                      info.holiday && 'text-blue-600 dark:text-blue-400',
                    )}>
                      {format(day, 'd')}
                    </span>

                    {info.holiday && !info.dayIsFuture && (
                      <span className="text-[8px] text-blue-500 truncate max-w-full leading-tight">{info.holiday.name}</span>
                    )}

                    {!info.dayIsFuture && !info.isWeekendDay && !info.holiday && (
                      <div className="mt-auto space-y-0.5">
                        {info.present > 0 && (
                          <div className="flex items-center gap-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                            <span className="text-[9px] text-green-700 dark:text-green-400 font-medium">{info.present}</span>
                          </div>
                        )}
                        {info.onLeave > 0 && (
                          <div className="flex items-center gap-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                            <span className="text-[9px] text-purple-600 dark:text-purple-400 font-medium">{info.onLeave}</span>
                          </div>
                        )}
                        {info.absent > 0 && (
                          <div className="flex items-center gap-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                            <span className="text-[9px] text-red-600 dark:text-red-400 font-medium">{info.absent}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {info.dayIsFuture ? 'Future date' :
                    info.holiday ? `Holiday — ${info.holiday.name}` :
                    info.isWeekendDay ? 'Weekend' :
                    `${info.present} present · ${info.onLeave} leave · ${info.absent} absent — Click to view`}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-3 pt-3">
          {[
            ['bg-green-500', 'Present'],
            ['bg-purple-500', 'Leave'],
            ['bg-red-500', 'Absent'],
            ['bg-blue-400', 'Holiday'],
          ].map(([bg, label]) => (
            <div key={label} className="flex items-center gap-1.5 text-xs">
              <div className={cn('w-2.5 h-2.5 rounded-full', bg)} />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
