import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { format, parseISO, isAfter, eachDayOfInterval, startOfMonth, endOfMonth, isWeekend as isWeekendFn, isFuture, isToday, isWithinInterval, getDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Download, Clock, TrendingUp, CalendarCheck, Pencil, Calendar as CalendarIcon, Plus, ClipboardEdit, CalendarPlus } from 'lucide-react';
import { AttendanceLog, LeaveRequest } from '@/hooks/useHR';
import { useAuth } from '@/hooks/useAuth';
import { useHolidays } from '@/hooks/useHolidays';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { CorrectionRequestModal } from '@/components/attendance/CorrectionRequestModal';
import { ProvisionalCheckoutBanner } from '@/components/attendance/ProvisionalCheckoutBanner';

interface MyAttendanceCalendarViewProps {
  todayAttendance: AttendanceLog | null;
  weeklyHours: number;
  attendanceLogs: AttendanceLog[];
  calendarMonth: Date;
  onMonthChange: (m: Date) => void;
  employeeId?: string;
  onRefresh?: () => void;
  yesterdayLog?: AttendanceLog | null;
  onCorrected?: () => void;
  onApplyLeave?: (prefillDate?: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  present: 'bg-green-500',
  absent: 'bg-red-500',
  half_day: 'bg-yellow-500',
  on_leave: 'bg-purple-500',
  weekend: 'bg-muted-foreground/30',
  holiday: 'bg-blue-400',
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
  casual: 'Paid (Casual)', sick: 'Sick', paid: 'Paid', unpaid: 'Unpaid', half_day: 'Half Day',
  half_day_casual: 'Half Day Paid', half_day_sick: 'Half Day Sick', half_day_paid: 'Half Day Paid',
  half_day_unpaid: 'Half Day Unpaid', wfh: 'Work from Home', EL: 'Earned Leave',
  half_day_EL: 'Half Day Earned',
};

function isCorrectionWindowOpen(log: AttendanceLog): boolean {
  const logDate = parseISO(log.date);
  const deadline = new Date(logDate.getFullYear(), logDate.getMonth(), logDate.getDate() + 1, 23, 59, 59);
  return !isAfter(new Date(), deadline);
}

export function MyAttendanceCalendarView({
  todayAttendance, weeklyHours, attendanceLogs, calendarMonth, onMonthChange, employeeId, onRefresh, yesterdayLog, onCorrected, onApplyLeave,
}: MyAttendanceCalendarViewProps) {
  const { role } = useAuth();
  const isHROrAdmin = role === 'admin' || role === 'hr';
  const { getHoliday } = useHolidays(calendarMonth.getFullYear());
  const [correctionLog, setCorrectionLog] = useState<AttendanceLog | null>(null);
  const [correctionIsVirtual, setCorrectionIsVirtual] = useState(false);
  // Chooser: shown when user clicks a date with no attendance log
  const [chooserDate, setChooserDate] = useState<Date | null>(null);

  const [approvedLeaves, setApprovedLeaves] = useState<LeaveRequest[]>([]);
  useEffect(() => {
    if (!employeeId) return;
    const monthStart = format(startOfMonth(calendarMonth), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(calendarMonth), 'yyyy-MM-dd');
    supabase.from('leave_requests').select('*').eq('employee_id', employeeId).eq('status', 'approved')
      .lte('start_date', monthEnd).gte('end_date', monthStart)
      .then(({ data }) => setApprovedLeaves((data as LeaveRequest[]) || []));
  }, [employeeId, calendarMonth]);

  const getApprovedLeave = (dateStr: string): LeaveRequest | undefined => {
    const d = parseISO(dateStr);
    return approvedLeaves.find(l => isWithinInterval(d, { start: parseISO(l.start_date), end: parseISO(l.end_date) }));
  };

  // Status detection
  const isCheckedIn = !!todayAttendance?.check_in_time;
  const isCheckedOut = !!todayAttendance?.check_out_time;
  const isOnBreak = !!todayAttendance?.break_start_time && !todayAttendance?.break_end_time;
  const currentStatus = !isCheckedIn ? 'Not Checked In' : isCheckedOut ? 'Completed' : isOnBreak ? 'On Break' : 'Working';

  // Monthly stats
  const monthStart = startOfMonth(calendarMonth);
  const monthEnd = endOfMonth(calendarMonth);
  const allMonthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const presentDays = attendanceLogs.filter(l => l.status === 'present').length;
  const totalWorkHours = attendanceLogs.reduce((s, l) => s + (l.working_hours || 0), 0);

  // Build log map
  const logsByDate: Record<string, AttendanceLog> = {};
  attendanceLogs.forEach(log => { logsByDate[log.date] = log; });

  // Calendar data
  const startPadding = getDay(monthStart);
  const paddedDays: (Date | null)[] = Array(startPadding).fill(null).concat(allMonthDays);

  // Month/Year selectors
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i);

  const getDayInfo = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const log = logsByDate[dateStr];
    const isWeekendDay = day.getDay() === 0 || day.getDay() === 6;
    const holiday = getHoliday(dateStr);
    const approvedLeave = getApprovedLeave(dateStr);
    const dayIsFuture = isFuture(day) && !isToday(day);

    let status = '';
    let color = '';
    let textColor = '';

    if (dayIsFuture) {
      status = '';
      color = '';
      textColor = 'text-muted-foreground';
    } else if (log) {
      if (log.status === 'present') {
        status = 'Present';
        color = 'bg-green-100 dark:bg-green-950/30';
        textColor = 'text-green-700 dark:text-green-400';
      } else if (log.status === 'on_leave') {
        status = 'Leave';
        color = 'bg-red-100 dark:bg-red-950/30';
        textColor = 'text-red-600 dark:text-red-400';
      } else if (log.status === 'half_day') {
        status = 'Half Day';
        color = 'bg-yellow-100 dark:bg-yellow-950/30';
        textColor = 'text-yellow-700 dark:text-yellow-400';
      } else {
        status = log.status;
        color = 'bg-muted/50';
        textColor = '';
      }
    } else if (approvedLeave) {
      status = 'Leave';
      color = 'bg-red-100 dark:bg-red-950/30';
      textColor = 'text-red-600 dark:text-red-400';
    } else if (holiday) {
      status = 'Holiday';
      color = 'bg-blue-100 dark:bg-blue-950/30';
      textColor = 'text-blue-600 dark:text-blue-400';
    } else if (isWeekendDay) {
      status = '';
      color = '';
      textColor = 'text-muted-foreground/60';
    } else if (!dayIsFuture) {
      status = '';
      color = '';
      textColor = '';
    }

    return { log, isWeekendDay, holiday, approvedLeave, dayIsFuture, status, color, textColor, dateStr };
  };

  const handleDateClick = async (day: Date) => {
    const { log, dayIsFuture, isWeekendDay, approvedLeave } = getDayInfo(day);
    if (dayIsFuture || !employeeId) return;

    if (log) {
      setCorrectionLog(log);
      setCorrectionIsVirtual(false);
    } else if (!approvedLeave) {
      // No log yet — let user choose between regularizing or applying for leave.
      setChooserDate(day);
    }
  };

  const startRegularizeForDate = (day: Date) => {
    if (!employeeId) return;
    const dateStr = format(day, 'yyyy-MM-dd');
    // Build a client-only placeholder log; the DB row is created on submit inside the modal.
    const virtualLog: AttendanceLog = {
      id: `virtual-${dateStr}`,
      employee_id: employeeId,
      date: dateStr,
      status: 'present',
      check_in_time: null,
      check_out_time: null,
      working_hours: 0,
      total_break_minutes: 0,
      is_provisional_checkout: false,
      notes: null,
    } as unknown as AttendanceLog;
    setChooserDate(null);
    setCorrectionIsVirtual(true);
    setCorrectionLog(virtualLog);
  };

  const startApplyLeaveForDate = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    setChooserDate(null);
    onApplyLeave?.(dateStr);
  };

  // CSV Export
  const exportCSV = () => {
    const headers = ['Date', 'Status', 'Leave Type', 'Check In', 'Check Out', 'Work Hours', 'Break (min)', 'Notes'];
    const rows = attendanceLogs.map(l => {
      const approvedLeave = getApprovedLeave(l.date);
      const leaveTypeLabel = approvedLeave ? (LEAVE_TYPE_LABELS[approvedLeave.leave_type] || approvedLeave.leave_type) : '';
      return [l.date, l.status, leaveTypeLabel,
        l.check_in_time ? format(new Date(l.check_in_time), 'HH:mm') : '',
        l.check_out_time ? format(new Date(l.check_out_time), 'HH:mm') : '',
        l.working_hours?.toFixed(2) || '0', Math.round(l.total_break_minutes || 0).toString(), l.notes || ''];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `attendance-${format(calendarMonth, 'yyyy-MM')}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  // Visible days for the table (up to today, reversed)
  const visibleDays = allMonthDays.filter(day => !isFuture(day) || isToday(day)).reverse();

  return (
    <div className="space-y-4">
      {/* Provisional checkout banner */}
      {yesterdayLog && (
        <ProvisionalCheckoutBanner yesterdayLog={yesterdayLog} onCorrected={() => onCorrected?.()} />
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={cn('w-3 h-3 rounded-full shrink-0',
              !isCheckedIn ? 'bg-red-500' : isCheckedOut ? 'bg-muted-foreground' : isOnBreak ? 'bg-yellow-500 animate-pulse' : 'bg-green-500 animate-pulse')} />
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

      {/* Calendar View */}
      <Card>
        <CardContent className="p-4">
          {/* Month/Year navigation */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMonthChange(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMonthChange(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Select value={calendarMonth.getMonth().toString()} onValueChange={v => onMonthChange(new Date(calendarMonth.getFullYear(), parseInt(v), 1))}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={calendarMonth.getFullYear().toString()} onValueChange={v => onMonthChange(new Date(parseInt(v), calendarMonth.getMonth(), 1))}>
                <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onMonthChange(new Date())}>Today</Button>
            {onApplyLeave && (
              <Button size="sm" className="h-8 text-xs gap-1" onClick={() => onApplyLeave()}>
                <Plus className="h-3.5 w-3.5" /> Apply for Leave
              </Button>
            )}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-0 border rounded-lg overflow-hidden">
            {/* Header */}
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2 bg-muted/40 border-b">
                {d}
              </div>
            ))}
            {/* Days */}
            {paddedDays.map((day, idx) => {
              if (!day) return <div key={`pad-${idx}`} className="min-h-[60px] border-b border-r bg-muted/10" />;

              const info = getDayInfo(day);
              const isTodayDay = isToday(day);

              return (
                <Tooltip key={day.toISOString()}>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        'min-h-[60px] border-b border-r p-1 text-left transition-colors relative flex flex-col',
                        info.color || 'hover:bg-muted/30',
                        isTodayDay && 'ring-2 ring-inset ring-primary',
                        !info.dayIsFuture && employeeId && 'cursor-pointer',
                        info.dayIsFuture && 'opacity-50 cursor-default',
                      )}
                      onClick={() => handleDateClick(day)}
                      disabled={info.dayIsFuture || !employeeId}
                    >
                      <span className={cn('text-sm font-medium', info.textColor, info.isWeekendDay && !info.status && 'text-muted-foreground/60')}>
                        {format(day, 'd')}
                      </span>
                      {info.status && (
                        <span className={cn('text-[9px] font-medium mt-auto', info.textColor)}>
                          {info.status}
                        </span>
                      )}
                      {info.holiday && !info.log && (
                        <span className="text-[8px] text-blue-500 truncate max-w-full">{info.holiday.name}</span>
                      )}
                      {info.log?.check_in_time && (
                        <span className="text-[8px] text-green-600">
                          ⏱ {format(new Date(info.log.check_in_time), 'HH:mm')}
                          {info.log.check_out_time && ` - ${format(new Date(info.log.check_out_time), 'HH:mm')}`}
                        </span>
                      )}
                      {info.log?.working_hours && info.log.working_hours > 0 && (
                        <span className="text-[8px] text-muted-foreground">{info.log.working_hours.toFixed(1)}h</span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {info.dayIsFuture ? 'Future date' :
                      info.log ? `${info.status} — Click to regularize` :
                      info.approvedLeave ? `On Leave — ${LEAVE_TYPE_LABELS[info.approvedLeave.leave_type] || info.approvedLeave.leave_type}` :
                      info.holiday ? `Holiday — ${info.holiday.name}` :
                      info.isWeekendDay ? 'Weekend — Click for options' :
                      'Click to regularize or apply for leave'}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3 pt-3">
            {[
              ['bg-green-100', 'text-green-700', 'Present'],
              ['bg-red-100', 'text-red-600', 'Leave'],
              ['bg-yellow-100', 'text-yellow-700', 'Half Day'],
              ['bg-blue-100', 'text-blue-600', 'Holiday'],
            ].map(([bg, text, label]) => (
              <div key={label} className="flex items-center gap-1.5 text-xs">
                <div className={cn('w-4 h-3 rounded-sm', bg)} />
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Attendance Table */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Attendance</h3>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={exportCSV}>
              <Download className="h-3 w-3" /> Export CSV
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">To update your attendance data, please click on the edit button next to each date.</p>

          {attendanceLogs.length === 0 && visibleDays.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No attendance records this month</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Check In</TableHead>
                    <TableHead className="text-xs">Check Out</TableHead>
                    <TableHead className="text-xs">Duration</TableHead>
                    <TableHead className="text-xs">Remarks</TableHead>
                    <TableHead className="text-xs text-right">Edit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleDays.map(day => {
                    const info = getDayInfo(day);
                    const { log, isWeekendDay, holiday, approvedLeave, dateStr } = info;

                    // Determine display status
                    let displayStatus = '-';
                    let statusBadge: React.ReactNode = null;
                    let remarks = '';

                    if (log) {
                      if (log.status === 'present') {
                        statusBadge = <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0">Present</Badge>;
                      } else if (log.status === 'on_leave') {
                        statusBadge = <Badge className="bg-red-500 text-white text-[10px] px-1.5 py-0">Leave</Badge>;
                        if (approvedLeave) remarks = LEAVE_TYPE_LABELS[approvedLeave.leave_type] || approvedLeave.leave_type;
                      } else if (log.status === 'half_day') {
                        statusBadge = <Badge className="bg-yellow-500 text-white text-[10px] px-1.5 py-0">Half Day</Badge>;
                      }
                      if (log.notes && !remarks) remarks = log.notes;
                      if (log.is_provisional_checkout) {
                        statusBadge = <div className="flex items-center gap-1">{statusBadge}<Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-400 text-amber-700">⚠</Badge></div>;
                      }
                    } else if (approvedLeave) {
                      statusBadge = <Badge className="bg-red-500 text-white text-[10px] px-1.5 py-0">Leave</Badge>;
                      remarks = LEAVE_TYPE_LABELS[approvedLeave.leave_type] || approvedLeave.leave_type;
                    } else if (holiday) {
                      statusBadge = <Badge className="bg-blue-400 text-white text-[10px] px-1.5 py-0">Holiday</Badge>;
                      remarks = holiday.name;
                    } else if (isWeekendDay) {
                      statusBadge = <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">Weekend</Badge>;
                    }

                    const checkInTime = log?.check_in_time ? format(new Date(log.check_in_time), 'HH:mm') : '';
                    const checkOutTime = log?.check_out_time ? format(new Date(log.check_out_time), 'HH:mm') : '';
                    const duration = log?.working_hours ? `${log.working_hours.toFixed(0)}:${Math.round((log.working_hours % 1) * 60).toString().padStart(2, '0')}` : '';

                    return (
                      <TableRow key={dateStr} className={cn(isWeekendDay && !log && 'opacity-60')}>
                        <TableCell className="text-xs font-medium whitespace-nowrap">{format(day, 'dd/MM/yyyy')}</TableCell>
                        <TableCell>{statusBadge || <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                        <TableCell className="text-xs">
                          {checkInTime ? <span className="text-green-600">⏱ {checkInTime}</span> : ''}
                        </TableCell>
                        <TableCell className="text-xs">
                          {checkOutTime ? <span className="text-red-500">⏱ {checkOutTime}</span> : ''}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{duration || ''}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{remarks}</TableCell>
                        <TableCell className="text-right">
                          {!info.dayIsFuture && employeeId && !approvedLeave && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleDateClick(day)}
                            >
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Correction request modal */}
      {correctionLog && (
        <CorrectionRequestModal
          log={correctionLog}
          open={!!correctionLog}
          onOpenChange={(open) => {
            if (!open) {
              // Cancel = no DB writes. Virtual logs never touched the DB.
              setCorrectionLog(null);
              setCorrectionIsVirtual(false);
            }
          }}
          mode="both"
          isVirtual={correctionIsVirtual}
          onSubmitted={() => {
            setCorrectionLog(null);
            setCorrectionIsVirtual(false);
            onRefresh?.();
          }}
        />
      )}

      {/* Action chooser dialog for empty dates */}
      <Dialog open={!!chooserDate} onOpenChange={(open) => { if (!open) setChooserDate(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {chooserDate ? format(chooserDate, 'EEEE, dd MMM yyyy') : ''}
            </DialogTitle>
            <DialogDescription>
              What would you like to do for this date?
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Button
              variant="outline"
              className="justify-start gap-2 h-auto py-3"
              onClick={() => chooserDate && startRegularizeForDate(chooserDate)}
            >
              <ClipboardEdit className="h-4 w-4 text-amber-600" />
              <div className="text-left">
                <div className="text-sm font-medium">Regularize Attendance</div>
                <div className="text-xs text-muted-foreground">Submit a check-in / check-out correction to HR</div>
              </div>
            </Button>
            {onApplyLeave && (
              <Button
                variant="outline"
                className="justify-start gap-2 h-auto py-3"
                onClick={() => chooserDate && startApplyLeaveForDate(chooserDate)}
              >
                <CalendarPlus className="h-4 w-4 text-primary" />
                <div className="text-left">
                  <div className="text-sm font-medium">Apply for Leave</div>
                  <div className="text-xs text-muted-foreground">Request leave for this date</div>
                </div>
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChooserDate(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
