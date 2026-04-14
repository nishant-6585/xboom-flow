import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, PhoneIncoming, PhoneMissed, Clock, Users, CalendarDays, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format, startOfDay, startOfWeek, startOfMonth, endOfDay, endOfWeek, endOfMonth, eachDayOfInterval, isWithinInterval, subDays } from 'date-fns';

interface CallLog {
  id: string;
  caller_number: string;
  agent_name: string | null;
  assigned_agent_name: string | null;
  call_status: string;
  call_duration: number | null;
  start_time: string | null;
  created_at: string;
  raw_payload: unknown;
  department: string | null;
  sales_person_name: string | null;
  outcall_info: string | null;
}

type Period = 'today' | 'this_week' | 'this_month' | 'last_7_days';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  this_week: 'This Week',
  this_month: 'This Month',
  last_7_days: 'Last 7 Days',
};

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--destructive))', 'hsl(var(--muted-foreground))'];

function getRange(period: Period) {
  const now = new Date();
  switch (period) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'this_week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'this_month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last_7_days':
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
  }
}

function deriveStatus(log: CallLog): 'answered' | 'missed' | 'other' {
  const status = log.call_status?.toLowerCase() || '';
  if (status.includes('answer') || status === 'completed') return 'answered';
  if (status.includes('miss') || status.includes('no-answer') || status === 'busy' || status === 'not-answered' || status === 'failed') return 'missed';
  return 'other';
}

function deriveDepartment(log: CallLog): string {
  if (log.department) return log.department.toLowerCase();
  const payload = log.raw_payload as any;
  if (payload?.department) return String(payload.department).toLowerCase();
  return '';
}

function getCallDate(log: CallLog): Date {
  if (log.start_time) {
    const d = new Date(log.start_time);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(log.created_at);
}

interface SupportCallsDashboardProps {
  logs: CallLog[];
}

export function SupportCallsDashboard({ logs }: SupportCallsDashboardProps) {
  const [period, setPeriod] = useState<Period>('this_week');

  const supportLogs = useMemo(() => {
    return logs.filter(l => deriveDepartment(l) === 'support');
  }, [logs]);

  const filtered = useMemo(() => {
    const range = getRange(period);
    return supportLogs.filter(l => {
      try {
        return isWithinInterval(getCallDate(l), range);
      } catch { return false; }
    });
  }, [supportLogs, period]);

  const stats = useMemo(() => {
    const answered = filtered.filter(l => deriveStatus(l) === 'answered');
    const missed = filtered.filter(l => deriveStatus(l) === 'missed');
    const totalDuration = answered.reduce((s, l) => s + (l.call_duration || 0), 0);
    const avgDuration = answered.length > 0 ? Math.round(totalDuration / answered.length) : 0;
    const updated = filtered.filter(l => l.outcall_info?.trim()).length;
    return {
      total: filtered.length,
      answered: answered.length,
      missed: missed.length,
      avgDuration,
      answerRate: filtered.length > 0 ? Math.round((answered.length / filtered.length) * 100) : 0,
      updateRate: filtered.length > 0 ? Math.round((updated / filtered.length) * 100) : 0,
    };
  }, [filtered]);

  const agentBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; total: number; answered: number; missed: number; totalDuration: number }>();
    filtered.forEach(l => {
      const name = l.assigned_agent_name || l.agent_name || l.sales_person_name || 'Unassigned';
      if (!map.has(name)) map.set(name, { name, total: 0, answered: 0, missed: 0, totalDuration: 0 });
      const e = map.get(name)!;
      e.total++;
      const s = deriveStatus(l);
      if (s === 'answered') { e.answered++; e.totalDuration += l.call_duration || 0; }
      if (s === 'missed') e.missed++;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const dailyData = useMemo(() => {
    const range = getRange(period);
    const days = eachDayOfInterval({ start: range.start, end: range.end > new Date() ? new Date() : range.end });
    return days.map(day => {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);
      const dayLogs = filtered.filter(l => {
        const d = getCallDate(l);
        return d >= dayStart && d <= dayEnd;
      });
      return {
        date: format(day, 'dd MMM'),
        answered: dayLogs.filter(l => deriveStatus(l) === 'answered').length,
        missed: dayLogs.filter(l => deriveStatus(l) === 'missed').length,
      };
    });
  }, [filtered, period]);

  const pieData = useMemo(() => [
    { name: 'Answered', value: stats.answered },
    { name: 'Missed', value: stats.missed },
  ].filter(d => d.value > 0), [stats]);

  const formatDuration = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Phone className="w-5 h-5 text-primary" />
          Support Calls Overview
        </h3>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[150px]">
            <CalendarDays className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PERIOD_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Total</div>
            <div className="text-2xl font-bold mt-1">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><PhoneIncoming className="h-3 w-3" /> Answered</div>
            <div className="text-2xl font-bold text-green-600 mt-1">{stats.answered}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><PhoneMissed className="h-3 w-3" /> Missed</div>
            <div className="text-2xl font-bold text-destructive mt-1">{stats.missed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Answer Rate</div>
            <div className="text-2xl font-bold mt-1">{stats.answerRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Avg Duration</div>
            <div className="text-2xl font-bold mt-1">{formatDuration(stats.avgDuration)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Update Rate</div>
            <div className="text-2xl font-bold mt-1">{stats.updateRate}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Daily Trend */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Daily Call Volume</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--popover-foreground))' }}
                  />
                  <Bar dataKey="answered" fill="hsl(var(--primary))" name="Answered" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="missed" fill="hsl(var(--destructive))" name="Missed" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground italic text-center py-8">No data for this period</p>
            )}
          </CardContent>
        </Card>

        {/* Agent Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> By Agent
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {agentBreakdown.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No data</p>
            ) : (
              agentBreakdown.slice(0, 6).map(a => (
                <div key={a.name} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground truncate mr-2">{a.name.split(' ')[0]}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-mono">{a.answered}/{a.total}</Badge>
                    {a.missed > 0 && (
                      <Badge variant="destructive" className="text-xs">{a.missed}⬇</Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
