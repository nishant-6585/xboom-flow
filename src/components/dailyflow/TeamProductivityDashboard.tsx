import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend, PieChart, Pie,
} from 'recharts';
import {
  Users, Clock, TrendingUp, AlertTriangle, Award, Activity,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface EmployeeFlowData {
  employeeId: string;
  employeeName: string;
  department: string;
  totalPlannedMinutes: number;
  totalEntries: number;
  breakMinutes: number;
  gapMinutes: number;
  overlapMinutes: number;
  uniqueDays: number;
  avgDailyPlanned: number;
  utilizationPct: number;
  efficiencyScore: number;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(142, 76%, 36%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 72%, 51%)',
  'hsl(262, 83%, 58%)',
  'hsl(199, 89%, 48%)',
  'hsl(328, 85%, 46%)',
];

const STANDARD_WORK_MINUTES = 480; // 8 hours

export function TeamProductivityDashboard() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<{ id: string; name: string; department: string }[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [departmentFilter, setDepartmentFilter] = useState('all');

  useEffect(() => {
    fetchData();
  }, [dateFrom, dateTo]);

  const fetchData = async () => {
    setLoading(true);
    const [empRes, entryRes, templateRes] = await Promise.all([
      supabase.from('employees').select('id, name, department').eq('is_active', true).order('name'),
      supabase.from('daily_flow_entries').select('*').gte('flow_date', dateFrom).lte('flow_date', dateTo),
      supabase.from('daily_flow_templates').select('*'),
    ]);
    setEmployees(empRes.data || []);
    setEntries(entryRes.data || []);
    setTemplates(templateRes.data || []);
    setLoading(false);
  };

  const departments = useMemo(() => {
    const depts = new Set(employees.map(e => e.department).filter(Boolean));
    return Array.from(depts).sort();
  }, [employees]);

  const employeeData: EmployeeFlowData[] = useMemo(() => {
    const filtered = departmentFilter === 'all'
      ? employees
      : employees.filter(e => e.department === departmentFilter);

    return filtered.map(emp => {
      const empEntries = entries.filter(e => e.employee_id === emp.id);
      const empTemplates = templates.filter(t => t.employee_id === emp.id);

      const totalPlannedMinutes = empEntries.reduce((sum, e) => sum + (e.duration_mins || 0), 0);
      const breakMinutes = empEntries.filter(e => e.is_break).reduce((sum, e) => sum + (e.duration_mins || 0), 0);
      const uniqueDays = new Set(empEntries.map(e => e.flow_date)).size;

      // Calculate gaps & overlaps
      let gapMinutes = 0;
      let overlapMinutes = 0;
      const dayGroups: Record<string, typeof empEntries> = {};
      empEntries.forEach(e => {
        if (!dayGroups[e.flow_date]) dayGroups[e.flow_date] = [];
        dayGroups[e.flow_date].push(e);
      });

      Object.values(dayGroups).forEach(dayEntries => {
        const sorted = dayEntries.sort((a, b) => a.time_from.localeCompare(b.time_from));
        for (let i = 1; i < sorted.length; i++) {
          const prevEnd = sorted[i - 1].time_to;
          const currStart = sorted[i].time_from;
          if (prevEnd < currStart) {
            const gapMs = timeToMinutes(currStart) - timeToMinutes(prevEnd);
            if (gapMs > 5) gapMinutes += gapMs;
          } else if (prevEnd > currStart) {
            overlapMinutes += timeToMinutes(prevEnd) - timeToMinutes(currStart);
          }
        }
      });

      const avgDailyPlanned = uniqueDays > 0 ? totalPlannedMinutes / uniqueDays : 0;
      const utilizationPct = uniqueDays > 0
        ? Math.min(100, (avgDailyPlanned / STANDARD_WORK_MINUTES) * 100)
        : 0;

      // Efficiency score: penalize gaps and overlaps
      const gapPenalty = Math.min(30, (gapMinutes / Math.max(1, totalPlannedMinutes)) * 100);
      const overlapPenalty = Math.min(20, (overlapMinutes / Math.max(1, totalPlannedMinutes)) * 100);
      const hasTemplate = empTemplates.length > 0 ? 10 : 0;
      const efficiencyScore = Math.max(0, Math.min(100,
        Math.round(utilizationPct * 0.6 + hasTemplate + (50 - gapPenalty - overlapPenalty))
      ));

      return {
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department || 'Unassigned',
        totalPlannedMinutes,
        totalEntries: empEntries.length,
        breakMinutes,
        gapMinutes: Math.round(gapMinutes),
        overlapMinutes: Math.round(overlapMinutes),
        uniqueDays,
        avgDailyPlanned: Math.round(avgDailyPlanned),
        utilizationPct: Math.round(utilizationPct),
        efficiencyScore,
      };
    }).sort((a, b) => b.efficiencyScore - a.efficiencyScore);
  }, [employees, entries, templates, departmentFilter]);

  const activeEmployees = employeeData.filter(e => e.uniqueDays > 0);
  const avgUtilization = activeEmployees.length > 0
    ? Math.round(activeEmployees.reduce((s, e) => s + e.utilizationPct, 0) / activeEmployees.length)
    : 0;
  const avgIdleTime = activeEmployees.length > 0
    ? Math.round(activeEmployees.reduce((s, e) => s + (STANDARD_WORK_MINUTES - e.avgDailyPlanned), 0) / activeEmployees.length)
    : 0;
  const totalGaps = activeEmployees.reduce((s, e) => s + e.gapMinutes, 0);
  const topPerformers = activeEmployees.slice(0, 3);
  const underUtilized = [...activeEmployees].sort((a, b) => a.utilizationPct - b.utilizationPct).slice(0, 3);

  // Chart data
  const barChartData = activeEmployees.map(e => ({
    name: e.employeeName.split(' ')[0],
    fullName: e.employeeName,
    utilization: e.utilizationPct,
    efficiency: e.efficiencyScore,
  }));

  const deptDistribution = useMemo(() => {
    const deptMap: Record<string, number> = {};
    activeEmployees.forEach(e => {
      deptMap[e.department] = (deptMap[e.department] || 0) + e.totalPlannedMinutes;
    });
    return Object.entries(deptMap).map(([name, value]) => ({ name, value: Math.round(value / 60) }));
  }, [activeEmployees]);

  // Heatmap data: hours of day vs days of week
  const heatmapData = useMemo(() => {
    const grid: Record<string, Record<number, number>> = {};
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach(d => { grid[d] = {}; for (let h = 8; h <= 20; h++) grid[d][h] = 0; });

    entries.forEach(entry => {
      const date = new Date(entry.flow_date);
      const dayIdx = (date.getDay() + 6) % 7; // Mon=0
      if (dayIdx >= 6) return;
      const dayName = days[dayIdx];
      const startHour = timeToMinutes(entry.time_from) / 60;
      const endHour = timeToMinutes(entry.time_to) / 60;
      for (let h = Math.floor(startHour); h < Math.ceil(endHour) && h <= 20; h++) {
        if (h >= 8) grid[dayName][h] = (grid[dayName][h] || 0) + 1;
      }
    });
    return { grid, days };
  }, [entries]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-[160px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-[160px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Department</Label>
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={() => {
            setDateFrom(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
            setDateTo(format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
          }}>This Week</Button>
          <Button variant="outline" size="sm" onClick={() => {
            setDateFrom(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
            setDateTo(format(new Date(), 'yyyy-MM-dd'));
          }}>Last 30 Days</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={<Activity className="h-5 w-5" />}
          title="Avg Utilization"
          value={`${avgUtilization}%`}
          subtitle={`${activeEmployees.length} active employees`}
          color="text-primary"
        />
        <KPICard
          icon={<Clock className="h-5 w-5" />}
          title="Avg Idle Time"
          value={`${avgIdleTime}m`}
          subtitle="Per employee per day"
          color="text-amber-500"
        />
        <KPICard
          icon={<AlertTriangle className="h-5 w-5" />}
          title="Total Gaps Found"
          value={`${totalGaps}m`}
          subtitle="Across all employees"
          color="text-destructive"
        />
        <KPICard
          icon={<Users className="h-5 w-5" />}
          title="Employees Tracked"
          value={`${activeEmployees.length}/${employeeData.length}`}
          subtitle="With flow entries"
          color="text-primary"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Utilization Bar Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Employee Utilization & Efficiency</CardTitle>
          </CardHeader>
          <CardContent>
            {barChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-xs fill-muted-foreground" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} className="text-xs fill-muted-foreground" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--popover-foreground))' }}
                    formatter={(value: number, name: string) => [`${value}%`, name === 'utilization' ? 'Utilization' : 'Efficiency']}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Legend />
                  <Bar dataKey="utilization" name="Utilization %" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="efficiency" name="Efficiency Score" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No flow data available for the selected period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Department Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Hours by Department</CardTitle>
          </CardHeader>
          <CardContent>
            {deptDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={deptDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}h`}
                    labelLine={false}
                  >
                    {deptDistribution.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--popover-foreground))' }}
                    formatter={(value: number) => [`${value} hours`]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
                No department data
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Heatmap */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Activity Heatmap (Time vs Day)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              <div className="flex">
                <div className="w-12" />
                {Array.from({ length: 13 }, (_, i) => i + 8).map(h => (
                  <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground font-medium pb-1">
                    {h > 12 ? `${h - 12}PM` : h === 12 ? '12PM' : `${h}AM`}
                  </div>
                ))}
              </div>
              {heatmapData.days.map(day => (
                <div key={day} className="flex items-center">
                  <div className="w-12 text-xs text-muted-foreground font-medium">{day}</div>
                  {Array.from({ length: 13 }, (_, i) => i + 8).map(h => {
                    const count = heatmapData.grid[day]?.[h] || 0;
                    const maxCount = Math.max(1, ...Object.values(heatmapData.grid).flatMap(d => Object.values(d)));
                    const intensity = count / maxCount;
                    return (
                      <div
                        key={h}
                        className="flex-1 aspect-[2/1] m-0.5 rounded-sm border border-border transition-colors"
                        style={{
                          backgroundColor: count > 0
                            ? `hsl(var(--primary) / ${0.15 + intensity * 0.75})`
                            : 'hsl(var(--muted) / 0.3)',
                        }}
                        title={`${day} ${h}:00 — ${count} tasks`}
                      />
                    );
                  })}
                </div>
              ))}
              <div className="flex items-center justify-end gap-2 mt-2">
                <span className="text-[10px] text-muted-foreground">Low</span>
                {[0.15, 0.35, 0.55, 0.75, 0.9].map((o, i) => (
                  <div key={i} className="w-4 h-3 rounded-sm" style={{ backgroundColor: `hsl(var(--primary) / ${o})` }} />
                ))}
                <span className="text-[10px] text-muted-foreground">High</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leaderboard & Under-Utilized */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-500" /> Top Performers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topPerformers.length > 0 ? topPerformers.map((emp, idx) => (
              <div key={emp.employeeId} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    idx === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
                    idx === 1 ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' :
                    'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
                  }`}>
                    #{idx + 1}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{emp.employeeName}</p>
                    <p className="text-xs text-muted-foreground">{emp.department}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-sm">{emp.efficiencyScore}</p>
                  <p className="text-xs text-muted-foreground">Score</p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No data for this period</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-destructive" /> Needs Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {underUtilized.length > 0 ? underUtilized.map(emp => (
              <div key={emp.employeeId} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium text-sm">{emp.employeeName}</p>
                  <p className="text-xs text-muted-foreground">{emp.department}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs">
                    {emp.utilizationPct}% utilized
                  </Badge>
                  {emp.gapMinutes > 30 && (
                    <Badge variant="destructive" className="text-xs">
                      {emp.gapMinutes}m gaps
                    </Badge>
                  )}
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No data for this period</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full Leaderboard Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Full Team Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">#</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Employee</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Dept</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Days</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Avg Daily (m)</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Utilization</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Gaps (m)</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Overlaps (m)</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Score</th>
                </tr>
              </thead>
              <tbody>
                {employeeData.map((emp, idx) => (
                  <tr key={emp.employeeId} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 px-3 text-muted-foreground">{idx + 1}</td>
                    <td className="py-2 px-3 font-medium">{emp.employeeName}</td>
                    <td className="py-2 px-3 text-muted-foreground">{emp.department}</td>
                    <td className="py-2 px-3 text-right">{emp.uniqueDays}</td>
                    <td className="py-2 px-3 text-right">{emp.avgDailyPlanned}</td>
                    <td className="py-2 px-3 text-right">
                      <span className={emp.utilizationPct >= 75 ? 'text-green-600 dark:text-green-400' : emp.utilizationPct >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-destructive'}>
                        {emp.utilizationPct}%
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">{emp.gapMinutes || '—'}</td>
                    <td className="py-2 px-3 text-right">{emp.overlapMinutes || '—'}</td>
                    <td className="py-2 px-3 text-right">
                      <Badge variant={emp.efficiencyScore >= 70 ? 'default' : emp.efficiencyScore >= 40 ? 'secondary' : 'destructive'} className="text-xs">
                        {emp.efficiencyScore}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {employeeData.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-muted-foreground">
                      No employees found for the selected filters
                    </td>
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

function KPICard({ icon, title, value, subtitle, color }: { icon: React.ReactNode; title: string; value: string; subtitle: string; color: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <div className={`${color} p-2 rounded-lg bg-muted/50`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
