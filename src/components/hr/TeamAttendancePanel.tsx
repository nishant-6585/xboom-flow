import { useState, useEffect, useCallback, useRef } from 'react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isToday, differenceInMinutes, subDays,
} from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Calendar, Download, Users, ChevronLeft, ChevronRight,
  UserCheck, UserX, CalendarCheck, Coffee, LogOut,
  Clock, AlertTriangle, RefreshCw, Activity, Eye,
  Timer, Zap, ShieldAlert, Pencil,
} from 'lucide-react';
import { Employee, AttendanceLog } from '@/hooks/useHR';
import { cn } from '@/lib/utils';
import { ProvisionalCorrectionModal } from '@/components/attendance/ProvisionalCorrectionModal';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LiveRow {
  employee: Employee;
  log: AttendanceLog | null;
  liveStatus: string;
  isLate: boolean;
  breakMinutes: number;
}

interface AttendancePolicy {
  work_start_time: string;        // "HH:MM:SS"
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

function getLiveStatus(log: AttendanceLog | null): string {
  if (!log || !log.check_in_time) return 'Not Checked In';
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

function deriveHistoricalStatus(log: AttendanceLog | null, date: Date, policy: AttendancePolicy = POLICY_DEFAULTS): string {
  const day = getDay(date);
  if (day === 0 || day === 6) return 'Weekend';
  if (!log) return 'Absent';
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
};

const CALENDAR_DOT: Record<string, string> = {
  Present: 'bg-green-500',
  Absent: 'bg-red-500',
  'On Leave': 'bg-purple-500',
  Late: 'bg-orange-500',
  'Half Day': 'bg-yellow-500',
  Weekend: 'bg-muted-foreground/30',
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface TeamAttendancePanelProps {
  employees: Employee[];
}

export function TeamAttendancePanel({ employees }: TeamAttendancePanelProps) {
  const [todayLogs, setTodayLogs] = useState<AttendanceLog[]>([]);
  const [yesterdayLogs, setYesterdayLogs] = useState<AttendanceLog[]>([]);
  const [monthLogs, setMonthLogs] = useState<AttendanceLog[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [loadingToday, setLoadingToday] = useState(false);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [policy, setPolicy] = useState<AttendancePolicy>(POLICY_DEFAULTS);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const policyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');

  // ── Fetch today's data (lightweight) ──
  const fetchToday = useCallback(async () => {
    setLoadingToday(true);
    const { data } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('date', todayStr);
    setTodayLogs((data as AttendanceLog[]) || []);

    const { data: yd } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('date', yesterdayStr);
    setYesterdayLogs((yd as AttendanceLog[]) || []);

    setLoadingToday(false);
    setLastRefresh(new Date());
  }, [todayStr, yesterdayStr]);

  // ── Fetch month data for Calendar/Monthly tabs ──
  const fetchMonth = useCallback(async () => {
    setLoadingMonth(true);
    const start = format(startOfMonth(calendarMonth), 'yyyy-MM-dd');
    const end = format(endOfMonth(calendarMonth), 'yyyy-MM-dd');
    const { data } = await supabase
      .from('attendance_logs')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false });
    setMonthLogs((data as AttendanceLog[]) || []);
    setLoadingMonth(false);
  }, [calendarMonth]);

  // Initial loads + policy fetch
  const fetchPolicy = useCallback(async () => {
    const { data } = await supabase
      .from('attendance_policy_settings')
      .select('work_start_time, grace_period_minutes, break_warning_minutes, break_severe_minutes')
      .limit(1)
      .maybeSingle();
    if (data) setPolicy(data as AttendancePolicy);
  }, []);

  useEffect(() => { fetchToday(); }, [fetchToday]);
  useEffect(() => { fetchMonth(); }, [fetchMonth]);
  useEffect(() => { fetchPolicy(); }, [fetchPolicy]);

  // 60s auto-refresh for today data; 5-min cache refresh for policy
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => { fetchToday(); }, 60_000);
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [fetchToday]);
  useEffect(() => {
    policyTimerRef.current = setInterval(() => { fetchPolicy(); }, 5 * 60_000);
    return () => { if (policyTimerRef.current) clearInterval(policyTimerRef.current); };
  }, [fetchPolicy]);

  // ── Build live rows ──
  const liveRows: LiveRow[] = employees.map(emp => {
    const log = todayLogs.find(l => l.employee_id === emp.id) || null;
    return {
      employee: emp,
      log,
      liveStatus: getLiveStatus(log),
      isLate: isLateCheckIn(log, policy),
      breakMinutes: currentBreakMinutes(log),
    };
  });

  // ── Control center metrics ──
  const metrics = {
    present: liveRows.filter(r => r.liveStatus === 'Working' || r.liveStatus === 'Completed').length,
    absent: liveRows.filter(r => r.liveStatus === 'Not Checked In').length,
    onLeave: liveRows.filter(r => r.liveStatus === 'On Leave').length,
    working: liveRows.filter(r => r.liveStatus === 'Working').length,
    onBreak: liveRows.filter(r => r.liveStatus === 'On Break').length,
    late: liveRows.filter(r => r.isLate).length,
    noCheckoutYesterday: employees.filter(emp => {
      const yl = yesterdayLogs.find(l => l.employee_id === emp.id);
      return yl?.check_in_time && !yl?.check_out_time;
    }).length,
  };

  // ── Anomalies — thresholds from policy ──
  const now = new Date();
  const lateHour = lateThresholdHour(policy);
  const noCheckInAfterThreshold = liveRows.filter(r =>
    r.liveStatus === 'Not Checked In' && now.getHours() + now.getMinutes() / 60 > lateHour
  );
  // keep alias for template usage
  const noCheckInAfter10 = noCheckInAfterThreshold;
  const longBreak = liveRows.filter(r =>
    r.liveStatus === 'On Break' && r.breakMinutes > policy.break_warning_minutes
  );
  const missingCheckoutYesterday = employees.filter(emp => {
    const yl = yesterdayLogs.find(l => l.employee_id === emp.id);
    return yl?.check_in_time && !yl?.check_out_time;
  });

  // ── CSV Export ──
  const monthDays = eachDayOfInterval({ start: startOfMonth(calendarMonth), end: endOfMonth(calendarMonth) });
  const exportCSV = () => {
    const rows: string[][] = [['Employee', 'Department', 'Date', 'Check In', 'Check Out', 'Work Hours', 'Break (min)', 'Status']];
    for (const emp of employees) {
      for (const day of monthDays) {
        const log = monthLogs.find(l => l.employee_id === emp.id && l.date === format(day, 'yyyy-MM-dd')) || null;
        const status = deriveHistoricalStatus(log, day);
        if (status === 'Weekend') continue;
        rows.push([
          emp.name, emp.department, format(day, 'yyyy-MM-dd'),
          log?.check_in_time ? format(new Date(log.check_in_time), 'HH:mm') : '',
          log?.check_out_time ? format(new Date(log.check_out_time), 'HH:mm') : '',
          (log?.working_hours || 0).toFixed(2),
          Math.round(log?.total_break_minutes || 0).toString(),
          status,
        ]);
      }
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `team-attendance-${format(calendarMonth, 'yyyy-MM')}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Tabs defaultValue="today" className="space-y-4">
      {/* ── Tab Header ── */}
      <div className="flex flex-col gap-2">
        <TabsList className="h-9 w-full grid grid-cols-4">
          <TabsTrigger value="today" className="gap-1 text-xs">
            <Activity className="h-3.5 w-3.5 shrink-0" /> Today
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1 text-xs">
            <Calendar className="h-3.5 w-3.5 shrink-0" /> <span className="hidden xs:inline">Calendar</span><span className="xs:hidden">Cal</span>
          </TabsTrigger>
          <TabsTrigger value="monthly" className="gap-1 text-xs">
            <CalendarCheck className="h-3.5 w-3.5 shrink-0" /> <span className="hidden xs:inline">Monthly</span><span className="xs:hidden">Month</span>
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-1 text-xs">
            <Download className="h-3.5 w-3.5 shrink-0" /> Export
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Refreshed {format(lastRefresh, 'hh:mm:ss a')}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchToday} disabled={loadingToday}>
            <RefreshCw className={cn('h-3.5 w-3.5', loadingToday && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* ══════════════════════════════════════════ TODAY ══ */}
      <TabsContent value="today" className="space-y-4 mt-0">
        {/* Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            { label: 'Present', value: metrics.present, icon: UserCheck, color: 'text-green-600', bg: 'bg-green-500/10' },
            { label: 'Absent', value: metrics.absent, icon: UserX, color: 'text-red-600', bg: 'bg-red-500/10' },
            { label: 'On Leave', value: metrics.onLeave, icon: CalendarCheck, color: 'text-purple-600', bg: 'bg-purple-500/10' },
            { label: 'Working', value: metrics.working, icon: Activity, color: 'text-blue-600', bg: 'bg-blue-500/10' },
            { label: 'On Break', value: metrics.onBreak, icon: Coffee, color: 'text-orange-600', bg: 'bg-orange-500/10' },
            { label: 'Late', value: metrics.late, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-500/10' },
            { label: 'No Checkout (Yesterday)', value: metrics.noCheckoutYesterday, icon: LogOut, color: 'text-rose-600', bg: 'bg-rose-500/10' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`flex flex-col items-start gap-1 rounded-xl px-3 py-2.5 ${bg}`}>
              <div className="flex items-center gap-1.5">
                <Icon className={`h-4 w-4 ${color}`} />
                <p className={`text-2xl font-bold leading-none ${color}`}>{value}</p>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {/* Anomaly Panel */}
        {(noCheckInAfter10.length > 0 || longBreak.length > 0 || missingCheckoutYesterday.length > 0) && (
          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Anomalies Detected
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              {noCheckInAfter10.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                    No check-in after 10 AM ({noCheckInAfter10.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {noCheckInAfter10.map(r => (
                      <Badge key={r.employee.id} variant="outline" className="text-xs border-amber-300 text-amber-700">
                        {r.employee.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {longBreak.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-1">
                    On break &gt; 60 min ({longBreak.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {longBreak.map(r => (
                      <Badge key={r.employee.id} variant="outline" className="text-xs border-orange-300 text-orange-700">
                        {r.employee.name} ({r.breakMinutes}m)
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {missingCheckoutYesterday.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 mb-1">
                    No checkout yesterday ({missingCheckoutYesterday.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {missingCheckoutYesterday.map(emp => (
                      <Badge key={emp.id} variant="outline" className="text-xs border-rose-300 text-rose-700">
                        {emp.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Live Status Table */}
        <LiveStatusTable liveRows={liveRows} loading={loadingToday} onRefresh={fetchToday} />
      </TabsContent>

      {/* ══════════════════════════════════════════ CALENDAR ══ */}
      <TabsContent value="calendar" className="space-y-4 mt-0">
        <CalendarSection
          employees={employees}
          calendarMonth={calendarMonth}
          setCalendarMonth={setCalendarMonth}
          monthLogs={monthLogs}
          loading={loadingMonth}
        />
      </TabsContent>

      {/* ══════════════════════════════════════════ MONTHLY ══ */}
      <TabsContent value="monthly" className="space-y-4 mt-0">
        <MonthlySection
          employees={employees}
          calendarMonth={calendarMonth}
          setCalendarMonth={setCalendarMonth}
          monthLogs={monthLogs}
          monthDays={monthDays}
          loading={loadingMonth}
        />
      </TabsContent>

      {/* ══════════════════════════════════════════ EXPORT ══ */}
      <TabsContent value="export" className="mt-0">
        <Card>
          <CardContent className="py-8 flex flex-col items-center gap-4">
            <Download className="h-10 w-10 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">Export Attendance Data</p>
              <p className="text-sm text-muted-foreground mt-1">
                Download {format(calendarMonth, 'MMMM yyyy')} attendance as CSV
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium w-32 text-center">{format(calendarMonth, 'MMM yyyy')}</span>
              <Button variant="ghost" size="icon" onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={exportCSV} className="gap-2">
              <Download className="h-4 w-4" /> Download CSV
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

// ─── Live Status Table ────────────────────────────────────────────────────────

type QuickFilter = 'all' | 'Working' | 'Not Checked In' | 'Late' | 'On Break' | 'Completed';

// ─── Employee Detail Dialog ───────────────────────────────────────────────────
function EmployeeDetailDialog({ row, open, onOpenChange }: {
  row: LiveRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!row) return null;
  const { employee, log, liveStatus, isLate, breakMinutes } = row;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            {employee.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn('text-xs font-medium gap-1', STATUS_STYLE[liveStatus] || '')}>
              {liveStatus}
            </Badge>
            {isLate && <Badge variant="outline" className="text-xs border-amber-300 bg-amber-50 text-amber-700">Late</Badge>}
            {log?.is_provisional_checkout && (
              <Badge variant="outline" className="text-xs border-yellow-400 bg-yellow-50 text-yellow-700 gap-1">
                <AlertTriangle className="h-3 w-3" /> Provisional Checkout
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm rounded-lg bg-muted/40 p-3">
            <div>
              <p className="text-xs text-muted-foreground">Department</p>
              <p className="font-medium">{employee.department}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Role</p>
              <p className="font-medium">{employee.role || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Check In</p>
              <p className="font-medium">{log?.check_in_time ? format(new Date(log.check_in_time), 'hh:mm a') : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Check Out</p>
              <p className="font-medium">{log?.check_out_time ? format(new Date(log.check_out_time), 'hh:mm a') : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Work Hours</p>
              <p className="font-medium">{log?.working_hours?.toFixed(1) || '—'}h</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Break</p>
              <p className="font-medium">
                {liveStatus === 'On Break' ? `${breakMinutes}m (ongoing)` : log?.total_break_minutes ? `${Math.round(log.total_break_minutes)}m` : '—'}
              </p>
            </div>
          </div>
          {log?.is_provisional_checkout && (
            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Auto-checkout was applied. Use the Edit Checkout button to correct the time.
            </p>
          )}
          {log?.corrected_at && (
            <p className="text-xs text-green-600 dark:text-green-400">
              ✓ Previously corrected on {format(new Date(log.corrected_at), 'dd MMM, hh:mm a')}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LiveStatusTable({ liveRows, loading, onRefresh }: { liveRows: LiveRow[]; loading: boolean; onRefresh?: () => void }) {
  const [filter, setFilter] = useState<QuickFilter>('all');
  const [empFilter, setEmpFilter] = useState('all');
  const [detailRow, setDetailRow] = useState<LiveRow | null>(null);
  const [correctionLog, setCorrectionLog] = useState<AttendanceLog | null>(null);

  const filtered = liveRows.filter(r => {
    if (empFilter !== 'all' && r.employee.id !== empFilter) return false;
    if (filter === 'all') return true;
    if (filter === 'Late') return r.isLate;
    return r.liveStatus === filter;
  });

  const quickFilters: { label: string; value: QuickFilter; color: string }[] = [
    { label: 'All', value: 'all', color: '' },
    { label: 'Working', value: 'Working', color: 'data-[active=true]:bg-blue-500 data-[active=true]:text-white' },
    { label: 'Absent', value: 'Not Checked In', color: 'data-[active=true]:bg-red-500 data-[active=true]:text-white' },
    { label: 'Late', value: 'Late', color: 'data-[active=true]:bg-amber-500 data-[active=true]:text-white' },
    { label: 'On Break', value: 'On Break', color: 'data-[active=true]:bg-orange-500 data-[active=true]:text-white' },
    { label: 'Completed', value: 'Completed', color: 'data-[active=true]:bg-green-500 data-[active=true]:text-white' },
  ];

  return (
    <>
      <Card>
        <CardHeader className="pb-0 pt-4 px-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Live Status — {format(new Date(), 'EEEE, dd MMMM yyyy')}
              <Badge variant="secondary" className="text-xs">{filtered.length} employees</Badge>
            </CardTitle>
            <Select value={empFilter} onValueChange={setEmpFilter}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <Users className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {liveRows.map(r => (
                  <SelectItem key={r.employee.id} value={r.employee.id}>
                    {r.employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Quick filter pills */}
          <div className="flex flex-wrap gap-1.5 mt-3 mb-1 pb-3 border-b">
            {quickFilters.map(({ label, value, color }) => (
              <button
                key={value}
                data-active={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                  filter === value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-foreground/30',
                  color,
                )}
              >
                {label}
                <span className="ml-1 opacity-70">
                  {value === 'all'
                    ? liveRows.length
                    : value === 'Late'
                    ? liveRows.filter(r => r.isLate).length
                    : liveRows.filter(r => r.liveStatus === value).length}
                </span>
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Employee</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Check In</th>
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
                      <tr key={employee.id} className={cn(
                        'border-b last:border-0 hover:bg-muted/30 transition-colors',
                        log?.is_provisional_checkout && 'bg-amber-50/30 dark:bg-amber-950/10',
                      )}>
                        <td className="px-4 py-3">
                          <p className="font-medium">{employee.name}</p>
                          <p className="text-xs text-muted-foreground">{employee.department}</p>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className={cn('text-xs font-medium gap-1 w-fit', STATUS_STYLE[liveStatus] || '')}>
                              {liveStatus === 'Working' && <Activity className="h-3 w-3" />}
                              {liveStatus === 'On Break' && <Coffee className="h-3 w-3" />}
                              {liveStatus === 'Completed' && <UserCheck className="h-3 w-3" />}
                              {liveStatus === 'Not Checked In' && <UserX className="h-3 w-3" />}
                              {liveStatus}
                            </Badge>
                            {log?.is_provisional_checkout && (
                              <Badge variant="outline" className="text-xs w-fit border-yellow-400 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400 gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Provisional
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {log?.check_in_time ? format(new Date(log.check_in_time), 'hh:mm a') : '—'}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {liveStatus === 'On Break'
                            ? <span className="text-orange-600 font-medium flex items-center gap-1"><Timer className="h-3 w-3" />{breakMinutes}m</span>
                            : log?.total_break_minutes ? `${Math.round(log.total_break_minutes)}m` : '—'}
                        </td>
                        <td className="px-3 py-3 font-medium">
                          {log?.working_hours ? `${log.working_hours.toFixed(1)}h` : '—'}
                        </td>
                        <td className="px-3 py-3">
                          {isLate
                            ? <Badge variant="outline" className="text-xs border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30">Late</Badge>
                            : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            {/* Eye — View Details */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="View Details"
                              onClick={() => setDetailRow(row)}
                            >
                              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            {/* Edit — only for provisional checkouts (HR/Admin always see this) */}
                            {log?.is_provisional_checkout && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-xs border-amber-400 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 gap-1"
                                title="Correct Provisional Checkout"
                                onClick={() => setCorrectionLog(log)}
                              >
                                <Pencil className="h-3 w-3" />
                                Edit
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-muted-foreground">No employees match this filter</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employee Detail Dialog */}
      <EmployeeDetailDialog
        row={detailRow}
        open={!!detailRow}
        onOpenChange={open => { if (!open) setDetailRow(null); }}
      />

      {/* Provisional Correction Modal (HR/Admin override) */}
      {correctionLog && (
        <ProvisionalCorrectionModal
          log={correctionLog}
          open={!!correctionLog}
          onOpenChange={open => { if (!open) setCorrectionLog(null); }}
          isAdminCorrection={true}
          onCorrected={() => {
            setCorrectionLog(null);
            onRefresh?.();
          }}
        />
      )}
    </>
  );
}

// ─── Calendar Section ─────────────────────────────────────────────────────────

function CalendarSection({ employees, calendarMonth, setCalendarMonth, monthLogs, loading }: {
  employees: Employee[];
  calendarMonth: Date;
  setCalendarMonth: React.Dispatch<React.SetStateAction<Date>>;
  monthLogs: AttendanceLog[];
  loading: boolean;
}) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(employees[0]?.id || '');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const monthDays = eachDayOfInterval({ start: startOfMonth(calendarMonth), end: endOfMonth(calendarMonth) });
  const startPadding = getDay(startOfMonth(calendarMonth));
  const paddedDays: (Date | null)[] = [...Array(startPadding).fill(null), ...monthDays];

  const calEmp = employees.find(e => e.id === selectedEmployeeId);
  const getLog = (empId: string, date: Date) =>
    monthLogs.find(l => l.employee_id === empId && l.date === format(date, 'yyyy-MM-dd')) || null;

  const selectedLog = selectedDay && calEmp ? getLog(calEmp.id, selectedDay) : null;
  const selectedStatus = selectedDay ? deriveHistoricalStatus(selectedLog, selectedDay) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[200px]">
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger className="h-9">
                  <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Select Employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name} — {emp.department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1 border rounded-lg px-2 h-9">
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium px-1 whitespace-nowrap">{format(calendarMonth, 'MMM yyyy')}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!calEmp ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">Select an employee to view calendar.</CardContent></Card>
      ) : (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">{calEmp.name} — {format(calendarMonth, 'MMMM yyyy')}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-7 mb-1">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {paddedDays.map((day, idx) => {
                if (!day) return <div key={`pad-${idx}`} className="aspect-square" />;
                const log = getLog(calEmp.id, day);
                const status = deriveHistoricalStatus(log, day);
                const isWknd = getDay(day) === 0 || getDay(day) === 6;
                const isSelected = selectedDay && format(selectedDay, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={cn(
                      'aspect-square flex flex-col items-center justify-center rounded text-xs transition-colors',
                      isToday(day) && 'ring-1 ring-primary',
                      isSelected && 'bg-primary/10',
                      !isWknd && 'hover:bg-muted/60 cursor-pointer',
                      isWknd && 'cursor-default opacity-40',
                    )}
                  >
                    <span className="font-medium">{format(day, 'd')}</span>
                    {!isWknd && (
                      <div className={cn('w-1.5 h-1.5 rounded-full mt-0.5', CALENDAR_DOT[status] || 'bg-muted')} />
                    )}
                  </button>
                );
              })}
            </div>
            {selectedDay && (
              <div className="mt-4 p-3 bg-muted/40 rounded-lg border text-sm space-y-1.5">
                <p className="font-medium">{format(selectedDay, 'EEEE, dd MMMM yyyy')}</p>
                <Badge variant="outline" className={cn('text-xs', STATUS_STYLE[selectedStatus || ''] || '')}>
                  {selectedStatus}
                </Badge>
                {selectedLog && (
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-2">
                    <span>Check In: {selectedLog.check_in_time ? format(new Date(selectedLog.check_in_time), 'hh:mm a') : '—'}</span>
                    <span>Check Out: {selectedLog.check_out_time ? format(new Date(selectedLog.check_out_time), 'hh:mm a') : '—'}</span>
                    <span>Hours: {selectedLog.working_hours?.toFixed(1) || '—'}</span>
                    <span>Break: {selectedLog.total_break_minutes ? `${Math.round(selectedLog.total_break_minutes)}m` : '—'}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Monthly Summary Section ──────────────────────────────────────────────────

function MonthlySection({ employees, calendarMonth, setCalendarMonth, monthLogs, monthDays, loading }: {
  employees: Employee[];
  calendarMonth: Date;
  setCalendarMonth: React.Dispatch<React.SetStateAction<Date>>;
  monthLogs: AttendanceLog[];
  monthDays: Date[];
  loading: boolean;
}) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('all');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const workdays = monthDays.filter(d => getDay(d) !== 0 && getDay(d) !== 6);
  const targetEmps = selectedEmployeeId === 'all' ? employees : employees.filter(e => e.id === selectedEmployeeId);

  const getLog = (empId: string, date: Date) =>
    monthLogs.find(l => l.employee_id === empId && l.date === format(date, 'yyyy-MM-dd')) || null;

  const rows = targetEmps.map(emp => {
    const log = getLog(emp.id, selectedDate);
    return { employee: emp, log, status: deriveHistoricalStatus(log, selectedDate) };
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[200px]">
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger className="h-9">
                  <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name} — {emp.department}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1 border rounded-lg px-2 h-9">
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium px-1">{format(calendarMonth, 'MMM yyyy')}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Date strip */}
      <Card>
        <CardContent className="p-3">
          <ScrollArea className="w-full">
            <div className="flex gap-1.5 pb-1">
              {workdays.map(day => (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    'flex flex-col items-center px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0',
                    format(selectedDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
                      ? 'bg-primary text-primary-foreground'
                      : isToday(day) ? 'border border-primary text-primary' : 'hover:bg-muted',
                  )}
                >
                  <span className="text-[10px] uppercase opacity-70">{format(day, 'EEE')}</span>
                  <span className="text-sm font-bold">{format(day, 'd')}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">
            {format(selectedDate, 'EEEE, dd MMMM yyyy')}
            <span className="text-muted-foreground font-normal ml-2">— {rows.length} employees</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">{[1,2,3].map(i=><div key={i} className="h-10 bg-muted rounded animate-pulse"/>)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Employee</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Check In</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Check Out</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Break</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Hours</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ employee, log, status }) => (
                    <tr key={employee.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium">{employee.name}</p>
                        <p className="text-xs text-muted-foreground">{employee.department}</p>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {log?.check_in_time ? format(new Date(log.check_in_time), 'hh:mm a') : '—'}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {log?.check_out_time ? format(new Date(log.check_out_time), 'hh:mm a') : '—'}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {log?.total_break_minutes ? `${Math.round(log.total_break_minutes)}m` : '—'}
                      </td>
                      <td className="px-3 py-3 font-medium">
                        {log?.working_hours ? `${log.working_hours.toFixed(1)}h` : '—'}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className={cn('text-xs font-medium', STATUS_STYLE[status] || '')}>
                          {status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No employees found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
