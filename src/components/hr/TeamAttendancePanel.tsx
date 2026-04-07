import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  format, isToday, differenceInMinutes, subDays, addDays, isFuture,
  getDay,
} from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useHolidays } from '@/hooks/useHolidays';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  Download, Users, ChevronLeft, ChevronRight,
  UserCheck, UserX, CalendarCheck, Coffee, LogOut,
  Clock, AlertTriangle, RefreshCw, Activity, Eye,
  Timer, Zap, Pencil, CalendarDays, LayoutDashboard, List,
} from 'lucide-react';
import { Employee, AttendanceLog } from '@/hooks/useHR';
import { cn } from '@/lib/utils';
import { ProvisionalCorrectionModal } from '@/components/attendance/ProvisionalCorrectionModal';
import { PendingCorrectionApprovals } from '@/components/attendance/PendingCorrectionApprovals';
import { AttendanceAlertsPanel, AttendanceAlertIndicator } from '@/components/hr/AttendanceAlertsPanel';
import { HRAttendanceEditModal } from '@/components/attendance/HRAttendanceEditModal';
import { BulkAttendanceEntryDialog } from '@/components/attendance/BulkAttendanceEntryDialog';
import { TeamAttendanceCalendarView } from '@/components/hr/TeamAttendanceCalendarView';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LiveRow {
  employee: Employee;
  log: AttendanceLog | null;
  liveStatus: string;
  isLate: boolean;
  breakMinutes: number;
}

interface AttendancePolicy {
  work_start_time: string;
  grace_period_minutes: number;
  break_warning_minutes: number;
  break_severe_minutes: number;
}

const POLICY_DEFAULTS: AttendancePolicy = {
  work_start_time: '09:30:00',
  grace_period_minutes: 15,
  break_warning_minutes: 60,
  break_severe_minutes: 90,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lateThresholdHour(policy: AttendancePolicy): number {
  const [h, m] = policy.work_start_time.split(':').map(Number);
  return h + m / 60 + policy.grace_period_minutes / 60;
}

function getLiveStatus(log: AttendanceLog | null, isHoliday?: boolean, hasApprovedLeave?: boolean, notEmployed?: boolean): string {
  if (notEmployed) return 'Not Employed';
  if (!log || !log.check_in_time) {
    if (isHoliday) return 'Holiday';
    if (hasApprovedLeave) return 'On Leave';
    return 'Not Checked In';
  }
  if (isHoliday) return 'Worked on Holiday';
  if (log.status === 'on_leave') return 'On Leave';
  if (log.check_out_time) return 'Completed';
  if (log.break_start_time && !log.break_end_time) return 'On Break';
  return 'Working';
}

function isLateCheckIn(log: AttendanceLog | null, policy: AttendancePolicy): boolean {
  if (!log?.check_in_time) return false;
  const d = new Date(log.check_in_time);
  return d.getHours() + d.getMinutes() / 60 > lateThresholdHour(policy);
}

function currentBreakMinutes(log: AttendanceLog | null): number {
  if (!log?.break_start_time || log.break_end_time) return log?.total_break_minutes || 0;
  return differenceInMinutes(new Date(), new Date(log.break_start_time));
}

function deriveHistoricalStatus(log: AttendanceLog | null, date: Date, policy: AttendancePolicy = POLICY_DEFAULTS, isHoliday?: boolean, hasApprovedLeave?: boolean, notEmployed?: boolean): string {
  if (notEmployed) return 'Not Employed';
  const day = getDay(date);
  if (day === 0 || day === 6) return 'Weekend';
  if (isHoliday && (!log || !log.check_in_time)) return 'Holiday';
  if (!log || !log.check_in_time) {
    if (hasApprovedLeave) return 'On Leave';
    return 'Absent';
  }
  if (isHoliday) return 'Worked on Holiday';
  if (log.status === 'on_leave') return 'On Leave';
  const wh = log.working_hours || 0;
  const checkInHour = log.check_in_time
    ? new Date(log.check_in_time).getHours() + new Date(log.check_in_time).getMinutes() / 60
    : null;
  if (wh > 0 && wh < 5) return 'Half Day';
  if (checkInHour && checkInHour > lateThresholdHour(policy)) return 'Late';
  if (wh >= 5) return 'Present';
  return 'Present';
}

const STATUS_STYLE: Record<string, string> = {
  Working: 'bg-blue-100 text-blue-700 border-blue-200',
  'On Break': 'bg-orange-100 text-orange-700 border-orange-200',
  Completed: 'bg-green-100 text-green-700 border-green-200',
  'On Leave': 'bg-purple-100 text-purple-700 border-purple-200',
  'Not Checked In': 'bg-red-100 text-red-700 border-red-200',
  Present: 'bg-green-100 text-green-700 border-green-200',
  Absent: 'bg-red-100 text-red-700 border-red-200',
  Late: 'bg-orange-100 text-orange-700 border-orange-200',
  'Half Day': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  Weekend: 'bg-muted text-muted-foreground',
  Holiday: 'bg-blue-100 text-blue-700 border-blue-200',
  'Worked on Holiday': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Not Employed': 'bg-gray-100 text-gray-500 border-gray-200',
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface TeamAttendancePanelProps {
  employees: Employee[];
}

export function TeamAttendancePanel({ employees }: TeamAttendancePanelProps) {
  const [todayLogs, setTodayLogs] = useState<AttendanceLog[]>([]);
  const [yesterdayLogs, setYesterdayLogs] = useState<AttendanceLog[]>([]);
  const [loadingToday, setLoadingToday] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [policy, setPolicy] = useState<AttendancePolicy>(POLICY_DEFAULTS);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const policyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeSubTab, setActiveSubTab] = useState('overview');

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const isViewingToday = isToday(selectedDate);
  const isViewingFuture = isFuture(selectedDate) && !isToday(selectedDate);
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const yesterdayOfSelectedStr = format(subDays(selectedDate, 1), 'yyyy-MM-dd');

  const { isHoliday, getHoliday } = useHolidays(selectedDate.getFullYear());
  const selectedDateIsHoliday = isHoliday(selectedDateStr);
  const holidayInfo = getHoliday(selectedDateStr);

  const [approvedLeaves, setApprovedLeaves] = useState<Record<string, { leave_type: string; start_date: string; end_date: string }>>({});

  const fetchToday = useCallback(async () => {
    setLoadingToday(true);
    const { data } = await supabase.from('attendance_logs').select('*').eq('date', selectedDateStr);
    setTodayLogs((data as AttendanceLog[]) || []);

    const { data: yd } = await supabase.from('attendance_logs').select('*').eq('date', yesterdayOfSelectedStr);
    setYesterdayLogs((yd as AttendanceLog[]) || []);

    const { data: leaves } = await supabase
      .from('leave_requests')
      .select('employee_id, leave_type, start_date, end_date')
      .eq('status', 'approved')
      .lte('start_date', selectedDateStr)
      .gte('end_date', selectedDateStr);

    const leaveMap: Record<string, { leave_type: string; start_date: string; end_date: string }> = {};
    (leaves || []).forEach((l: any) => { leaveMap[l.employee_id] = { leave_type: l.leave_type, start_date: l.start_date, end_date: l.end_date }; });
    setApprovedLeaves(leaveMap);
    setLoadingToday(false);
    setLastRefresh(new Date());
  }, [selectedDateStr, yesterdayOfSelectedStr]);

  const fetchPolicy = useCallback(async () => {
    const { data } = await supabase.from('attendance_policy_settings').select('work_start_time, grace_period_minutes, break_warning_minutes, break_severe_minutes').limit(1).maybeSingle();
    if (data) setPolicy(data as AttendancePolicy);
  }, []);

  useEffect(() => { fetchToday(); }, [fetchToday]);
  useEffect(() => { fetchPolicy(); }, [fetchPolicy]);

  useEffect(() => {
    if (!isViewingToday) return;
    refreshTimerRef.current = setInterval(() => { fetchToday(); }, 60_000);
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [fetchToday, isViewingToday]);
  useEffect(() => {
    policyTimerRef.current = setInterval(() => { fetchPolicy(); }, 5 * 60_000);
    return () => { if (policyTimerRef.current) clearInterval(policyTimerRef.current); };
  }, [fetchPolicy]);

  const liveRows: LiveRow[] = employees.map(emp => {
    const log = todayLogs.find(l => l.employee_id === emp.id) || null;
    const hasLeave = !!approvedLeaves[emp.id];
    const notEmployed = emp.joining_date ? selectedDateStr < emp.joining_date : false;
    const hasExited = emp.exit_date ? selectedDateStr > emp.exit_date : false;
    const isNotEmployed = notEmployed || hasExited;

    if (isViewingToday) {
      return { employee: emp, log, liveStatus: getLiveStatus(log, selectedDateIsHoliday, hasLeave, isNotEmployed), isLate: isNotEmployed || selectedDateIsHoliday ? false : isLateCheckIn(log, policy), breakMinutes: currentBreakMinutes(log) };
    }
    const historicalStatus = deriveHistoricalStatus(log, selectedDate, policy, selectedDateIsHoliday, hasLeave, isNotEmployed);
    return { employee: emp, log, liveStatus: historicalStatus, isLate: historicalStatus === 'Late', breakMinutes: log?.total_break_minutes || 0 };
  });

  const metrics = isViewingToday ? {
    present: liveRows.filter(r => r.liveStatus === 'Working' || r.liveStatus === 'Completed' || r.liveStatus === 'Worked on Holiday').length,
    absent: liveRows.filter(r => r.liveStatus === 'Not Checked In').length,
    onLeave: liveRows.filter(r => r.liveStatus === 'On Leave').length,
    working: liveRows.filter(r => r.liveStatus === 'Working').length,
    onBreak: liveRows.filter(r => r.liveStatus === 'On Break').length,
    late: liveRows.filter(r => r.isLate).length,
    holiday: liveRows.filter(r => r.liveStatus === 'Holiday' || r.liveStatus === 'Worked on Holiday').length,
    noCheckoutYesterday: employees.filter(emp => { const yl = yesterdayLogs.find(l => l.employee_id === emp.id); return yl?.check_in_time && !yl?.check_out_time; }).length,
  } : {
    present: liveRows.filter(r => r.liveStatus === 'Present' || r.liveStatus === 'Late' || r.liveStatus === 'Half Day' || r.liveStatus === 'Worked on Holiday').length,
    absent: liveRows.filter(r => r.liveStatus === 'Absent').length,
    onLeave: liveRows.filter(r => r.liveStatus === 'On Leave').length,
    working: 0, onBreak: 0,
    late: liveRows.filter(r => r.isLate).length,
    holiday: liveRows.filter(r => r.liveStatus === 'Holiday' || r.liveStatus === 'Worked on Holiday').length,
    noCheckoutYesterday: employees.filter(emp => { const yl = yesterdayLogs.find(l => l.employee_id === emp.id); return yl?.check_in_time && !yl?.check_out_time; }).length,
  };

  // Alert count for indicator
  const alertCount = useMemo(() => {
    let count = 0;
    const today = format(new Date(), 'yyyy-MM-dd');
    for (const log of todayLogs) {
      // All alerts only for past days
      if (log.date >= today) continue;
      if (log.working_hours && log.working_hours > 12) count++;
      if (log.check_in_time && !log.check_out_time && !log.is_provisional_checkout) count++;
      if (log.check_in_time) {
        const h = new Date(log.check_in_time).getHours();
        const m = new Date(log.check_in_time).getMinutes();
        if (h < 5) count++;
        if (h >= 10 || (h === 9 && m > 45)) count++;
      }
      if (log.is_provisional_checkout) count++;
    }
    return count;
  }, [todayLogs]);

  // Health score
  const healthScore = useMemo(() => {
    const relevantRows = liveRows.filter(r => r.liveStatus !== 'Not Employed' && r.liveStatus !== 'Weekend');
    const total = relevantRows.length;
    if (total === 0) return null;
    const presentCount = relevantRows.filter(r => ['Working', 'Completed', 'Present', 'Worked on Holiday', 'Late', 'Half Day', 'On Break'].includes(r.liveStatus)).length;
    const holidayOrLeave = relevantRows.filter(r => r.liveStatus === 'Holiday' || r.liveStatus === 'On Leave').length;
    const lateCount = relevantRows.filter(r => r.isLate).length;
    const baseScore = ((presentCount + holidayOrLeave) / total) * 100;
    const latePenalty = Math.min(lateCount * 2, 10);
    const anomalyPenalty = Math.min(alertCount * 3, 15);
    return Math.max(0, Math.min(100, Math.round(baseScore - latePenalty - anomalyPenalty)));
  }, [liveRows, alertCount]);

  const exportCSV = () => {
    const LEAVE_LABELS_CSV: Record<string, string> = { casual: 'Earned (Casual)', sick: 'Sick Leave', paid: 'Earned Leave', EL: 'Earned Leave', unpaid: 'Unpaid', half_day: 'Half Day', half_day_casual: 'Half Day Earned', half_day_sick: 'Half Day Sick', half_day_paid: 'Half Day Earned', half_day_EL: 'Half Day Earned', half_day_unpaid: 'Half Day Unpaid', wfh: 'WFH' };
    const rows: string[][] = [['Employee', 'Department', 'Date', 'Check In', 'Check Out', 'Work Hours', 'Break (min)', 'Status', 'Leave Type']];
    for (const emp of employees) {
      const log = todayLogs.find(l => l.employee_id === emp.id) || null;
      const notEmployed = emp.joining_date ? selectedDateStr < emp.joining_date : false;
      const hasExited = emp.exit_date ? selectedDateStr > emp.exit_date : false;
      const isNotEmployed = notEmployed || hasExited;
      const hasLeave = !!approvedLeaves[emp.id];
      const status = isViewingToday ? getLiveStatus(log, selectedDateIsHoliday, hasLeave, isNotEmployed) : deriveHistoricalStatus(log, selectedDate, policy, selectedDateIsHoliday, hasLeave, isNotEmployed);
      const leaveType = approvedLeaves[emp.id] ? (LEAVE_LABELS_CSV[approvedLeaves[emp.id].leave_type] || approvedLeaves[emp.id].leave_type) : '';
      rows.push([emp.name, emp.department, selectedDateStr, log?.check_in_time ? format(new Date(log.check_in_time), 'HH:mm') : '', log?.check_out_time ? format(new Date(log.check_out_time), 'HH:mm') : '', (log?.working_hours || 0).toFixed(2), Math.round(log?.total_break_minutes || 0).toString(), status, leaveType]);
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `team-attendance-${selectedDateStr}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const [correctionLog, setCorrectionLog] = useState<AttendanceLog | null>(null);

  const [bulkEntryOpen, setBulkEntryOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Date picker bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedDate(d => subDays(d, 1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {format(selectedDate, 'dd MMM yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarPicker mode="single" selected={selectedDate} onSelect={(date) => { if (date) { setSelectedDate(date); setDatePickerOpen(false); } }} disabled={(date) => isFuture(date) && !isToday(date)} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { const next = addDays(selectedDate, 1); if (!isFuture(next) || isToday(next)) setSelectedDate(next); }} disabled={isViewingToday}><ChevronRight className="h-3.5 w-3.5" /></Button>
        </div>
        {!isViewingToday && (
          <Button variant="secondary" size="sm" className="h-7 px-2.5 text-xs gap-1" onClick={() => setSelectedDate(new Date())}><Activity className="h-3 w-3" /> Reset to Today</Button>
        )}
        <div className="flex items-center gap-1.5 ml-auto text-xs text-muted-foreground">
          {isViewingToday && <Badge variant="outline" className="text-xs border-green-300 text-green-700 gap-1"><Activity className="h-3 w-3" />Live</Badge>}
          <span>Refreshed {format(lastRefresh, 'hh:mm:ss a')}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchToday} disabled={loadingToday}><RefreshCw className={cn('h-3.5 w-3.5', loadingToday && 'animate-spin')} /></Button>
        </div>
      </div>

      {isViewingFuture ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No data available for future dates.
          </CardContent>
        </Card>
      ) : (
        <>
          {selectedDateIsHoliday && holidayInfo && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/80 dark:bg-blue-950/20 dark:border-blue-800 px-4 py-2.5">
              <CalendarCheck className="h-4 w-4 text-blue-600 shrink-0" />
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400">🎉 Holiday — {holidayInfo.name}. Attendance tracking disabled for this date.</p>
            </div>
          )}

          {/* Sub Tabs */}
          <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
            <TabsList className="h-auto">
              <TabsTrigger value="overview" className="gap-1.5 text-xs"><LayoutDashboard className="h-3.5 w-3.5" />Overview</TabsTrigger>
              <TabsTrigger value="employees" className="gap-1.5 text-xs"><List className="h-3.5 w-3.5" />Employees</TabsTrigger>
              <TabsTrigger value="alerts" className="gap-1.5 text-xs">
                <AlertTriangle className="h-3.5 w-3.5" />
                Alerts
                {alertCount > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-1">{alertCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="export" className="gap-1.5 text-xs"><Download className="h-3.5 w-3.5" />Export</TabsTrigger>
              <TabsTrigger value="bulk_entry" className="gap-1.5 text-xs"><CalendarDays className="h-3.5 w-3.5" />Bulk Entry</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              {/* Metrics */}
              <div className={cn('grid gap-2', isViewingToday ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-8' : 'grid-cols-2 sm:grid-cols-5')}>
                {[
                  { label: 'Present', value: metrics.present, icon: UserCheck, color: 'text-green-600', bg: 'bg-green-500/10', show: true },
                  { label: 'Absent', value: metrics.absent, icon: UserX, color: 'text-red-600', bg: 'bg-red-500/10', show: true },
                  { label: 'Holiday', value: metrics.holiday, icon: CalendarCheck, color: 'text-blue-600', bg: 'bg-blue-500/10', show: selectedDateIsHoliday },
                  { label: 'On Leave', value: metrics.onLeave, icon: CalendarCheck, color: 'text-purple-600', bg: 'bg-purple-500/10', show: true },
                  { label: 'Working', value: metrics.working, icon: Activity, color: 'text-blue-600', bg: 'bg-blue-500/10', show: isViewingToday && !selectedDateIsHoliday },
                  { label: 'On Break', value: metrics.onBreak, icon: Coffee, color: 'text-orange-600', bg: 'bg-orange-500/10', show: isViewingToday && !selectedDateIsHoliday },
                  { label: 'Late', value: metrics.late, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-500/10', show: !selectedDateIsHoliday },
                  { label: isViewingToday ? 'No Checkout (Yesterday)' : `No Checkout (${format(subDays(selectedDate, 1), 'dd MMM')})`, value: metrics.noCheckoutYesterday, icon: LogOut, color: 'text-rose-600', bg: 'bg-rose-500/10', show: true },
                ].filter(m => m.show).map(({ label, value, icon: Icon, color, bg }) => (
                  <div key={label} className={cn('flex flex-col items-start gap-1 rounded-xl px-3 py-2.5', bg)}>
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn('h-4 w-4', color)} />
                      <p className={cn('text-2xl font-bold leading-none', color)}>{value}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
                  </div>
                ))}
              </div>

              {/* Health Score */}
              {healthScore !== null && (
                <Card>
                  <CardContent className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Attendance Health Score</span>
                      </div>
                      <div className="text-right">
                        <span className={cn('text-2xl font-bold', healthScore >= 90 ? 'text-green-600' : healthScore >= 70 ? 'text-amber-600' : healthScore >= 40 ? 'text-orange-600' : 'text-red-600')}>{healthScore}%</span>
                        <p className={cn('text-[11px] font-medium', healthScore >= 90 ? 'text-green-600' : healthScore >= 70 ? 'text-amber-600' : healthScore >= 40 ? 'text-orange-600' : 'text-red-600')}>
                          {healthScore >= 90 ? 'Excellent' : healthScore >= 70 ? 'Good' : healthScore >= 40 ? 'Moderate' : 'Poor'}
                        </p>
                      </div>
                    </div>
                    <Progress value={healthScore} className={cn('h-2', healthScore >= 90 ? '[&>div]:bg-green-500' : healthScore >= 70 ? '[&>div]:bg-amber-500' : healthScore >= 40 ? '[&>div]:bg-orange-500' : '[&>div]:bg-red-500')} />
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{metrics.present} present</span>
                      <span>{metrics.late} late</span>
                      <span>{metrics.absent} absent</span>
                      <span>{metrics.onLeave} on leave</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Team Calendar View */}
              <TeamAttendanceCalendarView
                totalEmployees={employees.length}
                onDateSelect={(date) => {
                  setSelectedDate(date);
                  setActiveSubTab('employees');
                }}
              />

              {/* Alert Indicator */}
              <AttendanceAlertIndicator alertCount={alertCount} onNavigate={() => setActiveSubTab('alerts')} />
            </TabsContent>

            {/* Employees Tab */}
            <TabsContent value="employees">
              <LiveStatusTable liveRows={liveRows} loading={loadingToday} onRefresh={fetchToday} isLive={isViewingToday} selectedDate={selectedDate} isHoliday={selectedDateIsHoliday} approvedLeaves={approvedLeaves} />
            </TabsContent>

            {/* Alerts Tab (includes Pending Corrections) */}
            <TabsContent value="alerts" className="space-y-4">
              <PendingCorrectionApprovals />
              <AttendanceAlertsPanel
                logs={todayLogs}
                employees={employees}
                selectedDate={selectedDate}
                onCorrectCheckout={(log) => setCorrectionLog(log)}
              />
            </TabsContent>

            {/* Export Tab */}
            <TabsContent value="export" className="space-y-4">
              <Card>
                <CardContent className="py-8 text-center space-y-4">
                  <Download className="h-10 w-10 mx-auto text-muted-foreground" />
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Export Attendance Data</h3>
                    <p className="text-xs text-muted-foreground mb-4">Download the attendance data for {format(selectedDate, 'dd MMM yyyy')} as a CSV file.</p>
                    <Button onClick={exportCSV} className="gap-2"><Download className="h-4 w-4" /> Download CSV</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Bulk Entry Tab */}
            <TabsContent value="bulk_entry" className="space-y-4">
              <Card>
                <CardContent className="py-8 text-center space-y-4">
                  <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground" />
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Bulk Attendance Entry</h3>
                    <p className="text-xs text-muted-foreground mb-4">Mark attendance for multiple employees across a date range.</p>
                    <Button onClick={() => setBulkEntryOpen(true)} className="gap-2"><CalendarDays className="h-4 w-4" /> Open Bulk Entry</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Provisional Correction Modal */}
      {correctionLog && (
        <ProvisionalCorrectionModal
          log={correctionLog}
          open={!!correctionLog}
          onOpenChange={open => { if (!open) setCorrectionLog(null); }}
          isAdminCorrection={true}
          onCorrected={() => { setCorrectionLog(null); fetchToday(); }}
        />
      )}

      <BulkAttendanceEntryDialog
        open={bulkEntryOpen}
        onOpenChange={setBulkEntryOpen}
        employees={employees}
        onSaved={() => { fetchToday(); }}
      />
    </div>
  );
}

// ─── Live Status Table ────────────────────────────────────────────────────────

type QuickFilter = 'all' | 'Working' | 'Not Checked In' | 'Late' | 'On Break' | 'Completed' | 'Holiday' | 'On Leave';

function EmployeeDetailDialog({ row, open, onOpenChange, leaveInfo }: { row: LiveRow | null; open: boolean; onOpenChange: (open: boolean) => void; leaveInfo?: { leave_type: string } }) {
  if (!row) return null;
  const { employee, log, liveStatus, isLate, breakMinutes } = row;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" />{employee.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn('text-xs font-medium gap-1', STATUS_STYLE[liveStatus] || '')}>{liveStatus}</Badge>
            {isLate && <Badge variant="outline" className="text-xs border-amber-300 bg-amber-50 text-amber-700">Late</Badge>}
            {liveStatus === 'On Leave' && leaveInfo && (
              <Badge variant="outline" className="text-xs border-purple-300 bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400">
                {LEAVE_TYPE_LABELS[leaveInfo.leave_type] || leaveInfo.leave_type}
              </Badge>
            )}
            {log?.is_provisional_checkout && (
              <Badge variant="outline" className="text-xs border-yellow-400 bg-yellow-50 text-yellow-700 gap-1"><AlertTriangle className="h-3 w-3" /> Provisional Checkout</Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm rounded-lg bg-muted/40 p-3">
            <div><p className="text-xs text-muted-foreground">Department</p><p className="font-medium">{employee.department}</p></div>
            <div><p className="text-xs text-muted-foreground">Role</p><p className="font-medium">{employee.role || '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Check In</p><p className="font-medium">{log?.check_in_time ? format(new Date(log.check_in_time), 'hh:mm a') : '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Check Out</p><p className="font-medium">{log?.check_out_time ? format(new Date(log.check_out_time), 'hh:mm a') : '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Work Hours</p><p className="font-medium">{log?.working_hours?.toFixed(1) || '—'}h</p></div>
            <div><p className="text-xs text-muted-foreground">Break</p><p className="font-medium">{liveStatus === 'On Break' ? `${breakMinutes}m (ongoing)` : log?.total_break_minutes ? `${Math.round(log.total_break_minutes)}m` : '—'}</p></div>
          </div>
          {log?.is_provisional_checkout && (
            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" />Auto-checkout was applied. Use the Edit Checkout button to correct the time.</p>
          )}
          {log?.corrected_at && (
            <p className="text-xs text-green-600 dark:text-green-400">✓ Previously corrected on {format(new Date(log.corrected_at), 'dd MMM, hh:mm a')}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  casual: 'Earned (Casual)', sick: 'Sick Leave', paid: 'Earned Leave', EL: 'Earned Leave', unpaid: 'Unpaid', half_day: 'Half Day',
  half_day_casual: 'Half Day Earned', half_day_sick: 'Half Day Sick', half_day_paid: 'Half Day Earned', half_day_EL: 'Half Day Earned', half_day_unpaid: 'Half Day Unpaid', wfh: 'WFH',
};

function LiveStatusTable({ liveRows, loading, onRefresh, isLive = true, selectedDate, isHoliday = false, approvedLeaves = {} }: { liveRows: LiveRow[]; loading: boolean; onRefresh?: () => void; isLive?: boolean; selectedDate?: Date; isHoliday?: boolean; approvedLeaves?: Record<string, { leave_type: string; start_date: string; end_date: string }> }) {
  const [filter, setFilter] = useState<QuickFilter>('all');
  const [empFilter, setEmpFilter] = useState('all');
  const [detailRow, setDetailRow] = useState<LiveRow | null>(null);
  const [correctionLog, setCorrectionLog] = useState<AttendanceLog | null>(null);
  const [editTarget, setEditTarget] = useState<{ row: LiveRow; date: string } | null>(null);

  const filtered = liveRows.filter(r => {
    if (empFilter !== 'all' && r.employee.id !== empFilter) return false;
    if (filter === 'all') return true;
    if (filter === 'Late') return r.isLate;
    if (filter === 'Holiday') return r.liveStatus === 'Holiday' || r.liveStatus === 'Worked on Holiday';
    if (!isLive && filter === 'Not Checked In') return r.liveStatus === 'Absent';
    return r.liveStatus === filter;
  });

  const quickFilters: { label: string; value: QuickFilter; color: string }[] = isLive
    ? [
        { label: 'All', value: 'all', color: '' },
        ...(isHoliday ? [{ label: 'Holiday', value: 'Holiday' as QuickFilter, color: 'data-[active=true]:bg-blue-500 data-[active=true]:text-white' }] : []),
        { label: 'Working', value: 'Working', color: 'data-[active=true]:bg-blue-500 data-[active=true]:text-white' },
        ...(!isHoliday ? [{ label: 'Absent', value: 'Not Checked In' as QuickFilter, color: 'data-[active=true]:bg-red-500 data-[active=true]:text-white' }] : []),
        { label: 'On Leave', value: 'On Leave' as QuickFilter, color: 'data-[active=true]:bg-purple-500 data-[active=true]:text-white' },
        { label: 'Late', value: 'Late', color: 'data-[active=true]:bg-amber-500 data-[active=true]:text-white' },
        { label: 'On Break', value: 'On Break', color: 'data-[active=true]:bg-orange-500 data-[active=true]:text-white' },
        { label: 'Completed', value: 'Completed', color: 'data-[active=true]:bg-green-500 data-[active=true]:text-white' },
      ]
    : [
        { label: 'All', value: 'all', color: '' },
        ...(isHoliday ? [{ label: 'Holiday', value: 'Holiday' as QuickFilter, color: 'data-[active=true]:bg-blue-500 data-[active=true]:text-white' }] : []),
        { label: 'On Leave', value: 'On Leave' as QuickFilter, color: 'data-[active=true]:bg-purple-500 data-[active=true]:text-white' },
        { label: 'Late', value: 'Late', color: 'data-[active=true]:bg-amber-500 data-[active=true]:text-white' },
      ];

  const displayDate = selectedDate || new Date();

  return (
    <>
      <Card>
        <CardHeader className="pb-0 pt-4 px-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {isLive ? <Zap className="h-4 w-4 text-primary" /> : <Clock className="h-4 w-4 text-muted-foreground" />}
              {isLive ? 'Live Status' : 'Attendance'} — {format(displayDate, 'EEEE, dd MMMM yyyy')}
              <Badge variant="secondary" className="text-xs">{filtered.length} employees</Badge>
            </CardTitle>
            <Select value={empFilter} onValueChange={setEmpFilter}>
              <SelectTrigger className="h-8 w-44 text-xs"><Users className="h-3.5 w-3.5 mr-1 text-muted-foreground" /><SelectValue placeholder="All Employees" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {liveRows.map(r => <SelectItem key={r.employee.id} value={r.employee.id}>{r.employee.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3 mb-1 pb-3 border-b">
            {quickFilters.map(({ label, value, color }) => (
              <button
                key={value}
                data-active={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                  filter === value ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-foreground/30',
                  color,
                )}
              >
                {label}
                <span className="ml-1 opacity-70">
                  {value === 'all' ? liveRows.length : value === 'Late' ? liveRows.filter(r => r.isLate).length : value === 'Holiday' ? liveRows.filter(r => r.liveStatus === 'Holiday' || r.liveStatus === 'Worked on Holiday').length : liveRows.filter(r => r.liveStatus === value).length}
                </span>
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Employee</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Check In</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Check Out</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Break</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Work Hrs</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Late</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const { employee, log, liveStatus, isLate, breakMinutes } = row;
                    return (
                      <tr key={employee.id} className={cn('border-b last:border-0 hover:bg-muted/30 transition-colors', log?.is_provisional_checkout && 'bg-amber-50/30 dark:bg-amber-950/10')}>
                        <td className="px-4 py-3"><p className="font-medium">{employee.name}</p><p className="text-xs text-muted-foreground">{employee.department}</p></td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className={cn('text-xs font-medium gap-1 w-fit', STATUS_STYLE[liveStatus] || '')}>
                              {liveStatus === 'Working' && <Activity className="h-3 w-3" />}
                              {liveStatus === 'On Break' && <Coffee className="h-3 w-3" />}
                              {liveStatus === 'Completed' && <UserCheck className="h-3 w-3" />}
                              {(liveStatus === 'Not Checked In' || liveStatus === 'Absent') && <UserX className="h-3 w-3" />}
                              {(liveStatus === 'On Leave' || liveStatus === 'Holiday' || liveStatus === 'Worked on Holiday') && <CalendarCheck className="h-3 w-3" />}
                              {liveStatus}
                            </Badge>
                            {liveStatus === 'On Leave' && approvedLeaves[employee.id] && (
                              <Badge variant="outline" className="text-xs w-fit border-purple-300 bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400">
                                {LEAVE_TYPE_LABELS[approvedLeaves[employee.id].leave_type] || approvedLeaves[employee.id].leave_type}
                              </Badge>
                            )}
                            {log?.is_provisional_checkout && (
                              <Badge variant="outline" className="text-xs w-fit border-yellow-400 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400 gap-1"><AlertTriangle className="h-3 w-3" />Provisional</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{log?.check_in_time ? format(new Date(log.check_in_time), 'hh:mm a') : '—'}</td>
                        <td className="px-3 py-3 text-muted-foreground">{log?.check_out_time ? format(new Date(log.check_out_time), 'hh:mm a') : '—'}</td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {isLive && liveStatus === 'On Break'
                            ? <span className="text-orange-600 font-medium flex items-center gap-1"><Timer className="h-3 w-3" />{breakMinutes}m</span>
                            : log?.total_break_minutes ? `${Math.round(log.total_break_minutes)}m` : '—'}
                        </td>
                        <td className="px-3 py-3 font-medium">{log?.working_hours ? `${log.working_hours.toFixed(1)}h` : '—'}</td>
                        <td className="px-3 py-3">
                          {isLate ? <Badge variant="outline" className="text-xs border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30">Late</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="View Details" onClick={() => setDetailRow(row)}><Eye className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                            {log?.is_provisional_checkout && (
                              <Button variant="outline" size="sm" className="h-6 px-2 text-xs border-amber-400 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 gap-1" title="Correct Provisional Checkout" onClick={() => setCorrectionLog(log)}>
                                <Pencil className="h-3 w-3" />Fix
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30 dark:border-blue-700 dark:text-blue-400 gap-1"
                              title="Edit Attendance"
                              onClick={() => setEditTarget({ row, date: format(selectedDate || new Date(), 'yyyy-MM-dd') })}
                            >
                              <Pencil className="h-3 w-3" />Edit
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No employees match this filter</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EmployeeDetailDialog row={detailRow} open={!!detailRow} onOpenChange={open => { if (!open) setDetailRow(null); }} leaveInfo={detailRow ? approvedLeaves[detailRow.employee.id] : undefined} />

      {correctionLog && (
        <ProvisionalCorrectionModal
          log={correctionLog}
          open={!!correctionLog}
          onOpenChange={open => { if (!open) setCorrectionLog(null); }}
          isAdminCorrection={true}
          onCorrected={() => { setCorrectionLog(null); onRefresh?.(); }}
        />
      )}

      {editTarget && (
        <HRAttendanceEditModal
          log={editTarget.row.log}
          employeeName={editTarget.row.employee.name}
          employeeId={editTarget.row.employee.id}
          date={editTarget.date}
          open={!!editTarget}
          onOpenChange={open => { if (!open) setEditTarget(null); }}
          onSaved={() => { setEditTarget(null); onRefresh?.(); }}
        />
      )}
    </>
  );
}
