import { useState, useEffect, useCallback, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, subMonths, getDay, parseISO, isWithinInterval } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useHolidays } from '@/hooks/useHolidays';
import { Employee, AttendanceLog } from '@/hooks/useHR';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { BarChart3, TrendingUp, Clock, CalendarDays } from 'lucide-react';

interface AttendanceAnalyticsProps {
  employees: Employee[];
}

const CHART_COLORS = {
  present: 'hsl(142, 76%, 36%)',
  absent: 'hsl(0, 84%, 60%)',
  leave: 'hsl(262, 83%, 58%)',
  late: 'hsl(25, 95%, 53%)',
  halfDay: 'hsl(48, 96%, 53%)',
  holiday: 'hsl(217, 91%, 60%)',
};

const LEAVE_LABELS: Record<string, string> = {
  casual: 'Paid (Casual)', sick: 'Sick', paid: 'Paid', unpaid: 'Unpaid',
  half_day: 'Half Day', wfh: 'WFH', EL: 'Earned Leave',
  half_day_casual: 'Half Day Casual', half_day_sick: 'Half Day Sick',
  half_day_paid: 'Half Day Paid', half_day_unpaid: 'Half Day Unpaid', half_day_EL: 'Half Day EL',
};

export function AttendanceAnalytics({ employees }: AttendanceAnalyticsProps) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth.toString());

  const year = parseInt(selectedYear);
  const month = parseInt(selectedMonth);
  const targetDate = new Date(year, month, 1);

  const { isHoliday } = useHolidays(year);

  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Also fetch last 6 months for trends
  const [trendLogs, setTrendLogs] = useState<AttendanceLog[]>([]);
  const [trendLeaves, setTrendLeaves] = useState<any[]>([]);

  const monthStart = format(startOfMonth(targetDate), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(targetDate), 'yyyy-MM-dd');
  const trendStart = format(startOfMonth(subMonths(targetDate, 5)), 'yyyy-MM-dd');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [logsRes, leavesRes, trendLogsRes, trendLeavesRes] = await Promise.all([
      supabase.from('attendance_logs').select('*').gte('date', monthStart).lte('date', monthEnd),
      supabase.from('leave_requests').select('employee_id, leave_type, start_date, end_date, status').eq('status', 'approved').lte('start_date', monthEnd).gte('end_date', monthStart),
      supabase.from('attendance_logs').select('employee_id, date, check_in_time, working_hours, status').gte('date', trendStart).lte('date', monthEnd),
      supabase.from('leave_requests').select('employee_id, leave_type, start_date, end_date, status').eq('status', 'approved').lte('start_date', monthEnd).gte('end_date', trendStart),
    ]);
    setLogs((logsRes.data as AttendanceLog[]) || []);
    setLeaves(leavesRes.data || []);
    setTrendLogs((trendLogsRes.data as AttendanceLog[]) || []);
    setTrendLeaves(trendLeavesRes.data || []);
    setLoading(false);
  }, [monthStart, monthEnd, trendStart]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activeEmployees = useMemo(() =>
    employees.filter(e => e.is_active && (!e.joining_date || e.joining_date <= monthEnd)),
    [employees, monthEnd]
  );

  // ─── Monthly Overview ────────────────────────────
  const monthlyOverview = useMemo(() => {
    const days = eachDayOfInterval({ start: startOfMonth(targetDate), end: endOfMonth(targetDate) });
    const today = new Date();
    let present = 0, absent = 0, onLeave = 0, late = 0, halfDay = 0;

    for (const day of days) {
      if (day > today) continue;
      const dayOfWeek = getDay(day);
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      const dateStr = format(day, 'yyyy-MM-dd');
      if (isHoliday(dateStr)) continue;

      for (const emp of activeEmployees) {
        const log = logs.find(l => l.employee_id === emp.id && l.date === dateStr);
        const hasLeave = leaves.some(l => l.employee_id === emp.id && dateStr >= l.start_date && dateStr <= l.end_date);

        if (log?.check_in_time) {
          const wh = log.working_hours || 0;
          if (wh > 0 && wh < 5) { halfDay++; }
          else {
            present++;
            const checkIn = new Date(log.check_in_time);
            if (checkIn.getHours() + checkIn.getMinutes() / 60 > 9.75) late++;
          }
        } else if (hasLeave) {
          onLeave++;
        } else {
          absent++;
        }
      }
    }

    return [
      { name: 'Present', value: present, color: CHART_COLORS.present },
      { name: 'Absent', value: absent, color: CHART_COLORS.absent },
      { name: 'On Leave', value: onLeave, color: CHART_COLORS.leave },
      { name: 'Half Day', value: halfDay, color: CHART_COLORS.halfDay },
    ];
  }, [logs, leaves, activeEmployees, targetDate, isHoliday]);

  const totalRecords = monthlyOverview.reduce((s, r) => s + r.value, 0);
  const lateCount = useMemo(() => {
    let count = 0;
    for (const log of logs) {
      if (log.check_in_time) {
        const ci = new Date(log.check_in_time);
        if (ci.getHours() + ci.getMinutes() / 60 > 9.75) count++;
      }
    }
    return count;
  }, [logs]);

  // ─── Employee Comparison ─────────────────────────
  const employeeComparison = useMemo(() => {
    const days = eachDayOfInterval({ start: startOfMonth(targetDate), end: endOfMonth(targetDate) });
    const today = new Date();
    const workingDays = days.filter(d => {
      if (d > today) return false;
      const dow = getDay(d);
      if (dow === 0 || dow === 6) return false;
      return !isHoliday(format(d, 'yyyy-MM-dd'));
    }).length;

    return activeEmployees.map(emp => {
      const empLogs = logs.filter(l => l.employee_id === emp.id && l.check_in_time);
      const presentDays = empLogs.length;
      const pct = workingDays > 0 ? Math.round((presentDays / workingDays) * 100) : 0;
      const totalHours = empLogs.reduce((s, l) => s + (l.working_hours || 0), 0);
      return { name: emp.name.split(' ')[0], fullName: emp.name, present: presentDays, total: workingDays, pct, hours: Math.round(totalHours * 10) / 10 };
    }).sort((a, b) => b.pct - a.pct).slice(0, 15);
  }, [logs, activeEmployees, targetDate, isHoliday]);

  // ─── Late Arrivals Trend (6 months) ──────────────
  const lateTrend = useMemo(() => {
    const result: { month: string; lateCount: number; totalCheckIns: number; pct: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = subMonths(targetDate, i);
      const mStart = format(startOfMonth(m), 'yyyy-MM-dd');
      const mEnd = format(endOfMonth(m), 'yyyy-MM-dd');
      const mLogs = trendLogs.filter(l => l.date >= mStart && l.date <= mEnd && l.check_in_time);
      const lateInMonth = mLogs.filter(l => {
        const ci = new Date(l.check_in_time!);
        return ci.getHours() + ci.getMinutes() / 60 > 9.75;
      }).length;
      result.push({
        month: format(m, 'MMM yy'),
        lateCount: lateInMonth,
        totalCheckIns: mLogs.length,
        pct: mLogs.length > 0 ? Math.round((lateInMonth / mLogs.length) * 100) : 0,
      });
    }
    return result;
  }, [trendLogs, targetDate]);

  // ─── Leave Patterns ──────────────────────────────
  const leavePatterns = useMemo(() => {
    const typeMap: Record<string, number> = {};
    for (const l of leaves) {
      const type = l.leave_type || 'other';
      const start = parseISO(l.start_date);
      const end = parseISO(l.end_date);
      const mStart = startOfMonth(targetDate);
      const mEnd = endOfMonth(targetDate);
      const effectiveStart = start < mStart ? mStart : start;
      const effectiveEnd = end > mEnd ? mEnd : end;
      const days = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });
      const workDays = days.filter(d => { const dow = getDay(d); return dow !== 0 && dow !== 6; }).length;
      typeMap[type] = (typeMap[type] || 0) + workDays;
    }
    return Object.entries(typeMap).map(([type, days]) => ({
      name: LEAVE_LABELS[type] || type,
      value: days,
    })).sort((a, b) => b.value - a.value);
  }, [leaves, targetDate]);

  const topLeaveTakers = useMemo(() => {
    const empMap: Record<string, { name: string; days: number }> = {};
    for (const l of leaves) {
      const emp = activeEmployees.find(e => e.id === l.employee_id);
      if (!emp) continue;
      const start = parseISO(l.start_date);
      const end = parseISO(l.end_date);
      const mStart = startOfMonth(targetDate);
      const mEnd = endOfMonth(targetDate);
      const effectiveStart = start < mStart ? mStart : start;
      const effectiveEnd = end > mEnd ? mEnd : end;
      const days = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });
      const workDays = days.filter(d => { const dow = getDay(d); return dow !== 0 && dow !== 6; }).length;
      if (!empMap[l.employee_id]) empMap[l.employee_id] = { name: emp.name, days: 0 };
      empMap[l.employee_id].days += workDays;
    }
    return Object.values(empMap).sort((a, b) => b.days - a.days).slice(0, 8);
  }, [leaves, activeEmployees, targetDate]);

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const years = Array.from({ length: 3 }, (_, i) => currentYear - 2 + i);

  const PIE_COLORS = ['hsl(142, 76%, 36%)', 'hsl(262, 83%, 58%)', 'hsl(25, 95%, 53%)', 'hsl(217, 91%, 60%)', 'hsl(48, 96%, 53%)', 'hsl(339, 90%, 51%)'];

  return (
    <div className="space-y-4">
      {/* Month/Year Selector */}
      <div className="flex items-center gap-2">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[90px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
        </Select>
        {loading && <Badge variant="outline" className="text-xs animate-pulse">Loading...</Badge>}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Records', value: totalRecords, icon: CalendarDays, color: 'text-blue-600' },
          { label: 'Present Days', value: monthlyOverview.find(r => r.name === 'Present')?.value || 0, icon: BarChart3, color: 'text-green-600' },
          { label: 'Late Arrivals', value: lateCount, icon: Clock, color: 'text-orange-600' },
          { label: 'Leaves Taken', value: monthlyOverview.find(r => r.name === 'On Leave')?.value || 0, icon: TrendingUp, color: 'text-purple-600' },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <kpi.icon className={`h-5 w-5 ${kpi.color} shrink-0`} />
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-lg font-bold">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Overview Pie */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Overview</CardTitle></CardHeader>
          <CardContent>
            {totalRecords > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={monthlyOverview.filter(d => d.value > 0)} cx="50%" cy="50%" outerRadius={90} innerRadius={50} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                    {monthlyOverview.filter(d => d.value > 0).map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No data for this period</div>
            )}
          </CardContent>
        </Card>

        {/* Employee Comparison Bar */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Employee Attendance %</CardTitle></CardHeader>
          <CardContent>
            {employeeComparison.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={employeeComparison} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" width={60} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(val: number, _n: string, p: any) => [`${val}% (${p.payload.present}/${p.payload.total} days)`, 'Attendance']} />
                  <Bar dataKey="pct" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No data</div>
            )}
          </CardContent>
        </Card>

        {/* Late Arrivals Trend Line */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Late Arrivals Trend (6 Months)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={lateTrend} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(val: number, name: string) => [name === 'lateCount' ? `${val} late check-ins` : `${val}%`, name === 'lateCount' ? 'Count' : 'Late %']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="lateCount" stroke="hsl(25, 95%, 53%)" strokeWidth={2} name="Late Count" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="pct" stroke="hsl(0, 84%, 60%)" strokeWidth={2} name="Late %" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Leave Patterns */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Leave Distribution by Type</CardTitle></CardHeader>
          <CardContent>
            {leavePatterns.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={leavePatterns} cx="50%" cy="50%" outerRadius={90} innerRadius={45} dataKey="value" label={({ name, value }) => `${name}: ${value}d`} labelLine={false} fontSize={10}>
                    {leavePatterns.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No leaves this month</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Leave Takers */}
      {topLeaveTakers.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top Leave Takers</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {topLeaveTakers.map((emp, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-border/50 p-2.5">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">{emp.name.charAt(0)}</div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{emp.name}</p>
                    <p className="text-xs text-muted-foreground">{emp.days} day{emp.days !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
