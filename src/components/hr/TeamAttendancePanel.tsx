import { useState, useEffect, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, isToday } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Download, Users, ChevronLeft, ChevronRight, LayoutList, UserCheck, UserX, CalendarCheck, Coffee, LogOut } from 'lucide-react';
import { Employee, AttendanceLog } from '@/hooks/useHR';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DailyRow {
  employee: Employee;
  log: AttendanceLog | null;
  status: string;
}

// ─── Status helpers ──────────────────────────────────────────────────────────

function deriveStatus(log: AttendanceLog | null, date: Date, leaveMap: Record<string, string>): string {
  const dateStr = format(date, 'yyyy-MM-dd');
  const day = getDay(date);
  if (day === 0 || day === 6) return 'Weekend';
  if (!log) return leaveMap[dateStr] ? 'On Leave' : 'Absent';
  if (log.status === 'on_leave') return 'On Leave';
  const wh = log.working_hours || 0;
  const checkInHour = log.check_in_time ? new Date(log.check_in_time).getHours() + new Date(log.check_in_time).getMinutes() / 60 : null;
  if (wh > 0 && wh < 5) return 'Half Day';
  if (checkInHour && checkInHour > 9.5) return 'Late';
  if (wh >= 5) return 'Present';
  return 'Present';
}

const STATUS_BADGE: Record<string, string> = {
  Present: 'bg-green-100 text-green-700 border-green-200',
  Absent: 'bg-red-100 text-red-700 border-red-200',
  'On Leave': 'bg-purple-100 text-purple-700 border-purple-200',
  Late: 'bg-orange-100 text-orange-700 border-orange-200',
  'Half Day': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  Weekend: 'bg-muted text-muted-foreground',
  'Working': 'bg-blue-100 text-blue-700 border-blue-200',
};

const CALENDAR_DOT: Record<string, string> = {
  Present: 'bg-green-500',
  Absent: 'bg-red-500',
  'On Leave': 'bg-purple-500',
  Late: 'bg-orange-500',
  'Half Day': 'bg-yellow-500',
  Weekend: 'bg-muted-foreground/30',
};

// ─── Main component ──────────────────────────────────────────────────────────

interface TeamAttendancePanelProps {
  employees: Employee[];
}

export function TeamAttendancePanel({ employees }: TeamAttendancePanelProps) {
  const [viewMode, setViewMode] = useState<'calendar' | 'table'>('table');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // ── Fetch logs for the selected month ──
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const start = format(startOfMonth(calendarMonth), 'yyyy-MM-dd');
    const end = format(endOfMonth(calendarMonth), 'yyyy-MM-dd');

    let query = supabase
      .from('attendance_logs')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false });

    if (selectedEmployeeId !== 'all') {
      query = query.eq('employee_id', selectedEmployeeId);
    }

    const { data } = await query;
    setLogs((data as AttendanceLog[]) || []);
    setLoading(false);
  }, [calendarMonth, selectedEmployeeId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // ── Helpers ──
  const getLog = (empId: string, date: Date) =>
    logs.find(l => l.employee_id === empId && l.date === format(date, 'yyyy-MM-dd')) || null;

  // ── Days in month ──
  const monthDays = eachDayOfInterval({ start: startOfMonth(calendarMonth), end: endOfMonth(calendarMonth) });

  // ── Build table rows (all employees × selected day OR all days of selected employee) ──
  // For "table" mode: show all employees for today-like daily view (current selected date or today)
  const tableDate = selectedDate || new Date();

  const dailyRows: DailyRow[] = (selectedEmployeeId === 'all' ? employees : employees.filter(e => e.id === selectedEmployeeId))
    .map(emp => {
      const log = getLog(emp.id, tableDate);
      return { employee: emp, log, status: deriveStatus(log, tableDate, {}) };
    });

  // ── For calendar single-employee ──
  const calEmp = selectedEmployeeId !== 'all' ? employees.find(e => e.id === selectedEmployeeId) : null;

  // ── CSV Export ──
  const exportCSV = () => {
    const targetEmps = selectedEmployeeId === 'all' ? employees : employees.filter(e => e.id === selectedEmployeeId);
    const rows: string[][] = [['Employee', 'Department', 'Date', 'Check In', 'Check Out', 'Work Hours', 'Break (min)', 'Status']];
    for (const emp of targetEmps) {
      for (const day of monthDays) {
        const log = getLog(emp.id, day);
        const status = deriveStatus(log, day, {});
        if (status === 'Weekend') continue;
        rows.push([
          emp.name,
          emp.department,
          format(day, 'yyyy-MM-dd'),
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
    a.href = url;
    a.download = `team-attendance-${format(calendarMonth, 'yyyy-MM')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Today's summary stats ──
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayLogs = logs.filter(l => l.date === todayStr);

  const todayStats = (() => {
    let present = 0, absent = 0, onLeave = 0, onBreak = 0, notCheckedOut = 0;
    for (const emp of employees) {
      const log = todayLogs.find(l => l.employee_id === emp.id) || null;
      if (!log) { absent++; continue; }
      if (log.status === 'on_leave') { onLeave++; continue; }
      if (log.break_start_time && !log.break_end_time) onBreak++;
      if (log.check_in_time && !log.check_out_time) notCheckedOut++;
      if (log.check_in_time) present++;
    }
    return { present, absent, onLeave, onBreak, notCheckedOut };
  })();

  return (
    <div className="space-y-4">
      {/* ── Today Summary Bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: 'Present', value: todayStats.present, icon: UserCheck, color: 'text-green-600', bg: 'bg-green-500/10' },
          { label: 'Absent', value: todayStats.absent, icon: UserX, color: 'text-red-600', bg: 'bg-red-500/10' },
          { label: 'On Leave', value: todayStats.onLeave, icon: CalendarCheck, color: 'text-purple-600', bg: 'bg-purple-500/10' },
          { label: 'On Break', value: todayStats.onBreak, icon: Coffee, color: 'text-orange-600', bg: 'bg-orange-500/10' },
          { label: 'Not Checked Out', value: todayStats.notCheckedOut, icon: LogOut, color: 'text-blue-600', bg: 'bg-blue-500/10' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`flex items-center gap-3 rounded-xl px-4 py-3 ${bg}`}>
            <Icon className={`h-5 w-5 shrink-0 ${color}`} />
            <div>
              <p className={`text-xl font-bold leading-none ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter Bar ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            {/* Employee filter */}
            <div className="flex-1 min-w-[200px]">
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger className="h-9">
                  <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name} — {emp.department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Month navigation */}
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

            {/* View toggle */}
            <div className="flex items-center gap-1 border rounded-lg p-1 h-9">
              <button
                onClick={() => setViewMode('table')}
                className={cn('px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1',
                  viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <LayoutList className="h-3.5 w-3.5" />
                Table
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={cn('px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1',
                  viewMode === 'calendar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <Calendar className="h-3.5 w-3.5" />
                Calendar
              </button>
            </div>

            {/* Export */}
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportCSV}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Content ── */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
        </div>
      ) : viewMode === 'table' ? (
        <TableView employees={selectedEmployeeId === 'all' ? employees : employees.filter(e => e.id === selectedEmployeeId)}
          monthDays={monthDays} logs={logs} />
      ) : (
        <CalendarView
          employees={employees}
          selectedEmployeeId={selectedEmployeeId}
          calEmp={calEmp || null}
          calendarMonth={calendarMonth}
          monthDays={monthDays}
          logs={logs}
        />
      )}
    </div>
  );
}

// ─── Table View ──────────────────────────────────────────────────────────────

function TableView({ employees, monthDays, logs }: {
  employees: Employee[];
  monthDays: Date[];
  logs: AttendanceLog[];
}) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Weekday-only
  const workdays = monthDays.filter(d => getDay(d) !== 0 && getDay(d) !== 6);

  const getLog = (empId: string, date: Date) =>
    logs.find(l => l.employee_id === empId && l.date === format(date, 'yyyy-MM-dd')) || null;

  const rows: DailyRow[] = employees.map(emp => {
    const log = getLog(emp.id, selectedDate);
    return { employee: emp, log, status: deriveStatus(log, selectedDate, {}) };
  });

  return (
    <div className="space-y-4">
      {/* Date selector strip */}
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
                      : isToday(day)
                      ? 'border border-primary text-primary'
                      : 'hover:bg-muted',
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

      {/* Table */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">
            {format(selectedDate, 'EEEE, dd MMMM yyyy')}
            <span className="text-muted-foreground font-normal ml-2">— {rows.length} employees</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
                      <Badge variant="outline" className={cn('text-xs font-medium', STATUS_BADGE[status] || '')}>
                        {status}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">No employees found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────

function CalendarView({ employees, selectedEmployeeId, calEmp, calendarMonth, monthDays, logs }: {
  employees: Employee[];
  selectedEmployeeId: string;
  calEmp: Employee | null;
  calendarMonth: Date;
  monthDays: Date[];
  logs: AttendanceLog[];
}) {
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const startPadding = getDay(startOfMonth(calendarMonth));
  const paddedDays: (Date | null)[] = [...Array(startPadding).fill(null), ...monthDays];

  const getLog = (empId: string, date: Date) =>
    logs.find(l => l.employee_id === empId && l.date === format(date, 'yyyy-MM-dd')) || null;

  if (!calEmp) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          Select a specific employee to view their calendar.
        </CardContent>
      </Card>
    );
  }

  const selectedLog = selectedDay ? getLog(calEmp.id, selectedDay) : null;
  const selectedStatus = selectedDay ? deriveStatus(selectedLog, selectedDay, {}) : null;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">
          {calEmp.name} — {format(calendarMonth, 'MMMM yyyy')}
        </CardTitle>
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
            const status = deriveStatus(log, day, {});
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
                <span className={cn('text-xs', isToday(day) && 'font-bold text-primary')}>
                  {format(day, 'd')}
                </span>
                {!isWknd && (
                  <div className={cn('w-1.5 h-1.5 rounded-full mt-0.5', CALENDAR_DOT[status] || 'bg-muted-foreground/20')} />
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t">
          {[['Present', 'bg-green-500'], ['Absent', 'bg-red-500'], ['On Leave', 'bg-purple-500'], ['Late', 'bg-orange-500'], ['Half Day', 'bg-yellow-500']].map(([label, color]) => (
            <div key={label} className="flex items-center gap-1 text-xs text-muted-foreground">
              <div className={cn('w-2 h-2 rounded-full', color)} />
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* Day detail */}
        {selectedDay && (
          <div className="mt-3 p-4 bg-muted/30 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">{format(selectedDay, 'EEEE, dd MMM yyyy')}</p>
              <div className="flex items-center gap-2">
                {selectedStatus && (
                  <Badge variant="outline" className={cn('text-xs', STATUS_BADGE[selectedStatus] || '')}>
                    {selectedStatus}
                  </Badge>
                )}
                <button onClick={() => setSelectedDay(null)} className="text-muted-foreground text-xs hover:text-foreground">✕</button>
              </div>
            </div>
            {selectedLog ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Check In</p>
                  <p className="font-medium">{selectedLog.check_in_time ? format(new Date(selectedLog.check_in_time), 'hh:mm a') : '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Check Out</p>
                  <p className="font-medium">{selectedLog.check_out_time ? format(new Date(selectedLog.check_out_time), 'hh:mm a') : '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Work Hours</p>
                  <p className="font-medium">{selectedLog.working_hours?.toFixed(1) || '0.0'}h</p></div>
                <div><p className="text-xs text-muted-foreground">Break</p>
                  <p className="font-medium">{Math.round(selectedLog.total_break_minutes || 0)}m</p></div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No attendance record</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
