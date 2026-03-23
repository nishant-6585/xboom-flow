import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, isAfter, eachDayOfInterval, startOfMonth, endOfMonth, isWeekend, isFuture, isToday, isWithinInterval } from 'date-fns';
import { ChevronLeft, ChevronRight, Download, Clock, TrendingUp, CalendarCheck, AlertTriangle, Pencil } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AttendanceLog, LeaveRequest } from '@/hooks/useHR';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CorrectionRequestModal } from '@/components/attendance/CorrectionRequestModal';
import { useHolidays } from '@/hooks/useHolidays';

interface AttendanceSectionProps {
  todayAttendance: AttendanceLog | null;
  weeklyHours: number;
  attendanceLogs: AttendanceLog[];
  calendarMonth: Date;
  onMonthChange: (m: Date) => void;
  employeeId?: string;
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

const LEAVE_TYPE_LABELS: Record<string, string> = {
  casual: 'Paid (Casual)',
  sick: 'Sick',
  paid: 'Paid',
  unpaid: 'Unpaid',
  half_day: 'Half Day',
  half_day_casual: 'Half Day Paid',
  half_day_sick: 'Half Day Sick',
  half_day_paid: 'Half Day Paid',
  half_day_unpaid: 'Half Day Unpaid',
  wfh: 'Work from Home',
};

// Correction window: until 11:59 PM of the day AFTER the log date
function isCorrectionWindowOpen(log: AttendanceLog): boolean {
  const logDate = parseISO(log.date);
  const deadline = new Date(logDate.getFullYear(), logDate.getMonth(), logDate.getDate() + 1, 23, 59, 59);
  return !isAfter(new Date(), deadline);
}

export function AttendanceSection({
  todayAttendance,
  weeklyHours,
  attendanceLogs,
  calendarMonth,
  onMonthChange,
  onRefresh,
  employeeId,
}: AttendanceSectionProps & { onRefresh?: () => void }) {
  const { role } = useAuth();
  const [correctionLog, setCorrectionLog] = useState<AttendanceLog | null>(null);
  const [stubLogId, setStubLogId] = useState<string | null>(null);
  const [shouldCleanupStub, setShouldCleanupStub] = useState(false);
  const [creatingStub, setCreatingStub] = useState(false);
  const { getHoliday } = useHolidays(calendarMonth.getFullYear());

  // Fetch approved leave requests for the current month
  const [approvedLeaves, setApprovedLeaves] = useState<LeaveRequest[]>([]);
  useEffect(() => {
    if (!employeeId) return;
    const monthStart = format(startOfMonth(calendarMonth), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(calendarMonth), 'yyyy-MM-dd');
    supabase
      .from('leave_requests')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('status', 'approved')
      .lte('start_date', monthEnd)
      .gte('end_date', monthStart)
      .then(({ data }) => {
        setApprovedLeaves((data as LeaveRequest[]) || []);
      });
  }, [employeeId, calendarMonth]);

  // Helper to check if a date falls within any approved leave
  const getApprovedLeave = (dateStr: string): LeaveRequest | undefined => {
    const d = parseISO(dateStr);
    return approvedLeaves.find(l =>
      isWithinInterval(d, { start: parseISO(l.start_date), end: parseISO(l.end_date) })
    );
  };

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

  // Monthly stats - count all non-weekend, non-future days
  const monthStart = startOfMonth(calendarMonth);
  const monthEnd = endOfMonth(calendarMonth);
  const allMonthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const workingDaysUpToToday = allMonthDays.filter(d => d.getDay() !== 0 && d.getDay() !== 6 && !getHoliday(format(d, 'yyyy-MM-dd')) && (!isFuture(d) || isToday(d)));
  
  const presentDays = attendanceLogs.filter(l => l.status === 'present').length;
  const totalWorkHours = attendanceLogs.reduce((s, l) => s + (l.working_hours || 0), 0);

  // CSV Export
  const exportCSV = () => {
    const headers = ['Date', 'Status', 'Leave Type', 'Check In', 'Check Out', 'Work Hours', 'Break (min)', 'Notes'];
    const rows = attendanceLogs.map(l => {
      const approvedLeave = getApprovedLeave(l.date);
      const leaveTypeLabel = approvedLeave ? (LEAVE_TYPE_LABELS[approvedLeave.leave_type] || approvedLeave.leave_type) : (l.status === 'on_leave' ? 'On Leave' : '');
      return [
        l.date,
        l.status,
        leaveTypeLabel,
        l.check_in_time ? format(new Date(l.check_in_time), 'HH:mm') : '',
        l.check_out_time ? format(new Date(l.check_out_time), 'HH:mm') : '',
        l.working_hours?.toFixed(2) || '0',
        Math.round(l.total_break_minutes || 0).toString(),
        l.notes || '',
      ];
    });
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

      {/* Attendance List */}
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
          {attendanceLogs.length === 0 ? (
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
                    <TableHead className="text-xs">Hours</TableHead>
                    <TableHead className="text-xs hidden sm:table-cell">Break</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const monthStart = startOfMonth(calendarMonth);
                    const monthEnd = endOfMonth(calendarMonth);
                    const today = new Date();
                    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
                    
                    // Build a map of logs by date string
                    const logsByDate: Record<string, AttendanceLog> = {};
                    attendanceLogs.forEach(log => {
                      logsByDate[log.date] = log;
                    });

                    // Only show days up to today (not future days)
                    const visibleDays = allDays.filter(day => !isFuture(day) || isToday(day));

                    return visibleDays.reverse().map(day => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const log = logsByDate[dateStr];
                      const isWeekendDay = day.getDay() === 0 || day.getDay() === 6;

                      const holiday = getHoliday(dateStr);

                      if (!log) {
                        // No attendance record — check for approved leave
                        const approvedLeave = getApprovedLeave(dateStr);
                        const isOnApprovedLeave = !!approvedLeave;
                        const dayStatus = isOnApprovedLeave ? 'on_leave' : isWeekendDay ? 'weekend' : holiday ? 'holiday' : 'absent';
                        const leaveTypeLabel = approvedLeave ? (LEAVE_TYPE_LABELS[approvedLeave.leave_type] || approvedLeave.leave_type) : '';
                        const dayStatusText = isOnApprovedLeave ? `On Leave — ${leaveTypeLabel}` : isWeekendDay ? 'Weekend' : holiday ? `Holiday — ${holiday.name}` : 'Absent';
                        const dayStatusColor = isOnApprovedLeave ? 'bg-purple-500' : isWeekendDay ? 'bg-muted-foreground/30' : holiday ? 'bg-blue-400' : 'bg-red-500';
                        const isNonWorking = isWeekendDay || !!holiday || isOnApprovedLeave;

                        return (
                          <TableRow key={dateStr} className={cn(isNonWorking && 'opacity-50')}>
                            <TableCell className="text-xs font-medium whitespace-nowrap">
                              {format(day, 'dd MMM, EEE')}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <div className={cn('w-2 h-2 rounded-full shrink-0', dayStatusColor)} />
                                <span className="text-xs">{dayStatusText}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">—</TableCell>
                            <TableCell className="text-xs">—</TableCell>
                            <TableCell className="text-xs font-medium">0.0h</TableCell>
                            <TableCell className="text-xs hidden sm:table-cell">—</TableCell>
                            <TableCell className="text-right">
                              {!isFuture(day) && employeeId && !isOnApprovedLeave && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 px-2 text-[10px] gap-1 border-amber-400 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                      disabled={creatingStub}
                                      onClick={async () => {
                                        setCreatingStub(true);
                                        try {
                                          // Create a stub attendance log for this date
                                          const { data, error } = await supabase
                                            .from('attendance_logs')
                                            .insert({
                                              employee_id: employeeId,
                                              date: dateStr,
                                              status: 'present',
                                              source: 'regularization',
                                            })
                                            .select()
                                            .single();
                                          if (error) throw error;
                                          setStubLogId(data.id);
                                          setShouldCleanupStub(true);
                                          setCorrectionLog(data as AttendanceLog);
                                        } catch (e: any) {
                                          toast.error(e.message || 'Failed to create attendance record');
                                        } finally {
                                          setCreatingStub(false);
                                        }
                                      }}
                                    >
                                      <Pencil className="h-3 w-3" />
                                      Regularize
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="text-xs">
                                    {isWeekendDay ? 'Mark weekend attendance' : holiday ? 'Mark holiday attendance' : 'Request attendance correction'}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      }

                      // Existing log row
                      const isProvisional = !!log.is_provisional_checkout;
                      const windowOpen = isCorrectionWindowOpen(log);
                      const canEdit = isHROrAdmin || (isProvisional && windowOpen);
                      const canRequestCorrection = !isHROrAdmin && !canEdit && !!log.check_in_time;

                      return (
                        <TableRow key={log.id} className={cn(isProvisional && 'bg-amber-50/50 dark:bg-amber-950/10')}>
                          <TableCell className="text-xs font-medium whitespace-nowrap">
                            {format(parseISO(log.date), 'dd MMM, EEE')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <div className={cn('w-2 h-2 rounded-full shrink-0', STATUS_COLORS[log.status] || 'bg-muted')} />
                              <span className="text-xs">{STATUS_TEXT[log.status] || log.status}</span>
                              {log.status === 'on_leave' && (() => {
                                const approvedLeave = getApprovedLeave(log.date);
                                return approvedLeave ? (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-300 bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400">
                                    {LEAVE_TYPE_LABELS[approvedLeave.leave_type] || approvedLeave.leave_type}
                                  </Badge>
                                ) : null;
                              })()}
                              {isProvisional && windowOpen && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/30">
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                </Badge>
                              )}
                              {log.corrected_at && !isProvisional && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 border-green-400 bg-green-50 text-green-700 dark:bg-green-950/30">✓</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {log.check_in_time ? format(new Date(log.check_in_time), 'hh:mm a') : '—'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {log.check_out_time ? format(new Date(log.check_out_time), 'hh:mm a') : '—'}
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {(log.working_hours || 0).toFixed(1)}h
                          </TableCell>
                          <TableCell className="text-xs hidden sm:table-cell">
                            {log.total_break_minutes ? `${Math.round(log.total_break_minutes)}m` : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] gap-1 border-amber-400 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                  onClick={() => setCorrectionLog(log)}
                                >
                                  <Pencil className="h-3 w-3" />
                                  Regularize
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs">
                                {isHROrAdmin ? 'Correct attendance' : 'Request attendance correction'}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t">
            {[['present', 'bg-green-500', 'Present'], ['absent', 'bg-red-500', 'Absent'], ['on_leave', 'bg-purple-500', 'Leave'], ['half_day', 'bg-yellow-500', 'Half Day'], ['holiday', 'bg-blue-400', 'Holiday']].map(([, color, label]) => (
              <div key={label} className="flex items-center gap-1 text-xs text-muted-foreground">
                <div className={cn('w-2 h-2 rounded-full', color)} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Correction request modal */}
      {correctionLog && (
        <CorrectionRequestModal
          log={correctionLog}
          open={!!correctionLog}
          onOpenChange={async (open) => {
            if (!open) {
              // If dismissed without submitting & this was a stub, delete the stub
              if (shouldCleanupStub && stubLogId && correctionLog && correctionLog.id === stubLogId) {
                await supabase.from('attendance_logs').delete().eq('id', stubLogId);
                onRefresh?.();
              }
              setCorrectionLog(null);
              setStubLogId(null);
              setShouldCleanupStub(false);
            }
          }}
          mode="both"
          onSubmitted={() => {
            setShouldCleanupStub(false);
            setCorrectionLog(null);
            setStubLogId(null);
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}
