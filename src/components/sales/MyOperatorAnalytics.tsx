import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Phone, PhoneIncoming, PhoneMissed, Target, Users, TrendingUp, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { format, startOfDay, startOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, subDays, subWeeks, isWithinInterval, parseISO } from 'date-fns';

interface CallLog {
  id: string;
  call_id: string | null;
  caller_number: string;
  agent_name: string | null;
  assigned_agent_name: string | null;
  call_status: string;
  call_duration: number | null;
  start_time: string | null;
  created_at: string;
  raw_payload: unknown;
  is_prospect: boolean | null;
  department: string | null;
}

interface LegDetail {
  _ac?: string;
  _rr?: Array<{ _na?: string }>;
}

function getCallDate(log: CallLog): Date {
  if (log.start_time) {
    const num = Number(log.start_time);
    if (!isNaN(num) && num > 1000000000) return new Date(num * 1000);
    const d = new Date(log.start_time);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(log.created_at);
}

function deriveStatus(log: CallLog): 'answered' | 'missed' {
  const payload = log.raw_payload as Record<string, unknown> | null;
  const legs: LegDetail[] = payload?._ld && Array.isArray(payload._ld) ? payload._ld as LegDetail[] : [];
  if (legs.length > 0) {
    return legs.some(l => l._ac === 'received') ? 'answered' : 'missed';
  }
  return log.call_status?.toLowerCase().includes('answer') ? 'answered' : 'missed';
}

function deriveAgentName(log: CallLog): string {
  const payload = log.raw_payload as Record<string, unknown> | null;
  const legs: LegDetail[] = payload?._ld && Array.isArray(payload._ld) ? payload._ld as LegDetail[] : [];
  const names: string[] = [];
  for (const leg of legs) {
    if (Array.isArray(leg._rr)) {
      for (const r of leg._rr) {
        if (r._na) names.push(r._na);
      }
    }
  }
  if (names.length > 0) return names[names.length - 1];
  return log.assigned_agent_name || log.agent_name || 'Unknown';
}

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(24, 70%, 50%)',
  'hsl(160, 60%, 45%)',
  'hsl(280, 60%, 55%)',
];

interface MyOperatorAnalyticsProps {
  logs: CallLog[];
  prospects?: { source_type: string; created_at: string }[];
}

export function MyOperatorAnalytics({ logs, prospects = [] }: MyOperatorAnalyticsProps) {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [agentPeriod, setAgentPeriod] = useState<'day' | 'week' | 'month'>('week');

  const enrichedLogs = useMemo(() => {
    return logs.map(log => ({
      ...log,
      date: getCallDate(log),
      status: deriveStatus(log),
      agent: deriveAgentName(log),
    }));
  }, [logs]);

  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  // ---- Summary stats ----
  const todayLogs = useMemo(() => enrichedLogs.filter(l => l.date >= todayStart), [enrichedLogs, todayStart]);
  const weekLogs = useMemo(() => enrichedLogs.filter(l => l.date >= weekStart), [enrichedLogs, weekStart]);
  const monthLogs = useMemo(() => enrichedLogs.filter(l => l.date >= monthStart), [enrichedLogs, monthStart]);

  const stats = useMemo(() => {
    const compute = (arr: typeof enrichedLogs) => ({
      total: arr.length,
      answered: arr.filter(l => l.status === 'answered').length,
      missed: arr.filter(l => l.status === 'missed').length,
    });
    return { day: compute(todayLogs), week: compute(weekLogs), month: compute(monthLogs) };
  }, [todayLogs, weekLogs, monthLogs]);

  // ---- Prospect counts from prospects prop ----
  const myopProspects = useMemo(() => prospects.filter(p => p.source_type === 'myoperator'), [prospects]);
  const prospectStats = useMemo(() => {
    const todayP = myopProspects.filter(p => new Date(p.created_at) >= todayStart).length;
    const weekP = myopProspects.filter(p => new Date(p.created_at) >= weekStart).length;
    const monthP = myopProspects.filter(p => new Date(p.created_at) >= monthStart).length;
    return { day: todayP, week: weekP, month: monthP };
  }, [myopProspects, todayStart, weekStart, monthStart]);

  // ---- Agent breakdown ----
  const agentData = useMemo(() => {
    const map = new Map<string, { answered: number; missed: number; total: number }>();
    const targetLogs = agentPeriod === 'day' ? todayLogs : agentPeriod === 'week' ? weekLogs : monthLogs;
    for (const l of targetLogs) {
      const entry = map.get(l.agent) || { answered: 0, missed: 0, total: 0 };
      entry.total++;
      if (l.status === 'answered') entry.answered++;
      else entry.missed++;
      map.set(l.agent, entry);
    }
    return Array.from(map.entries())
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.total - a.total);
  }, [agentPeriod, todayLogs, weekLogs, monthLogs]);

  // ---- Daily call volume chart (last 14 days) ----
  const dailyData = useMemo(() => {
    const days = eachDayOfInterval({ start: subDays(now, 13), end: now });
    return days.map(day => {
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      const dayLogs = enrichedLogs.filter(l => l.date >= day && l.date <= dayEnd);
      const dayProspects = myopProspects.filter(p => {
        const pd = new Date(p.created_at);
        return pd >= day && pd <= dayEnd;
      });
      return {
        date: format(day, 'dd MMM'),
        answered: dayLogs.filter(l => l.status === 'answered').length,
        missed: dayLogs.filter(l => l.status === 'missed').length,
        total: dayLogs.length,
        prospects: dayProspects.length,
      };
    });
  }, [enrichedLogs, myopProspects, now]);

  // ---- Sales vs Support daily breakdown (last 14 days) ----
  const salesVsSupportData = useMemo(() => {
    const days = eachDayOfInterval({ start: subDays(now, 13), end: now });
    return days.map(day => {
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      const dayLogs = enrichedLogs.filter(l => l.date >= day && l.date <= dayEnd);
      const salesCalls = dayLogs.filter(l => l.department?.toLowerCase() === 'sales').length;
      const supportCalls = dayLogs.filter(l => l.department?.toLowerCase() === 'support').length;
      const otherCalls = dayLogs.length - salesCalls - supportCalls;
      const total = dayLogs.length;
      const salesPct = total > 0 ? Math.round((salesCalls / total) * 100) : 0;
      return {
        date: format(day, 'dd MMM'),
        sales: salesCalls,
        support: supportCalls,
        other: otherCalls,
        total,
        salesPct,
      };
    });
  }, [enrichedLogs, now]);

  // ---- Weekly data (last 8 weeks) ----
  const weeklyData = useMemo(() => {
    const weeks: { label: string; start: Date; end: Date }[] = [];
    for (let i = 7; i >= 0; i--) {
      const ws = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);
      we.setHours(23, 59, 59, 999);
      weeks.push({ label: format(ws, 'dd MMM'), start: ws, end: we });
    }
    return weeks.map(w => {
      const wLogs = enrichedLogs.filter(l => l.date >= w.start && l.date <= w.end);
      const wProsp = myopProspects.filter(p => {
        const pd = new Date(p.created_at);
        return pd >= w.start && pd <= w.end;
      });
      return {
        date: w.label,
        answered: wLogs.filter(l => l.status === 'answered').length,
        missed: wLogs.filter(l => l.status === 'missed').length,
        total: wLogs.length,
        prospects: wProsp.length,
      };
    });
  }, [enrichedLogs, myopProspects, now]);

  const chartData = period === 'day' ? dailyData : weeklyData;

  const customTooltipStyle = {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    color: 'hsl(var(--foreground))',
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Today */}
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Today</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.day.total}</p>
            <div className="flex gap-2 mt-1">
              <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-green-500/20 text-green-500">{stats.day.answered} ✓</Badge>
              <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-red-500/20 text-red-500">{stats.day.missed} ✗</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border-indigo-500/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-500" />
              <span className="text-xs text-muted-foreground">This Week</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.week.total}</p>
            <div className="flex gap-2 mt-1">
              <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-green-500/20 text-green-500">{stats.week.answered} ✓</Badge>
              <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-red-500/20 text-red-500">{stats.week.missed} ✗</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">This Month</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.month.total}</p>
            <div className="flex gap-2 mt-1">
              <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-green-500/20 text-green-500">{stats.month.answered} ✓</Badge>
              <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-red-500/20 text-red-500">{stats.month.missed} ✗</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Answer Rate */}
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <PhoneIncoming className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Answer Rate</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              {stats.week.total > 0 ? Math.round((stats.week.answered / stats.week.total) * 100) : 0}%
            </p>
            <span className="text-[10px] text-muted-foreground">This week</span>
          </CardContent>
        </Card>

        {/* Prospects */}
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Prospects Today</span>
            </div>
            <p className="text-2xl font-bold mt-1">{prospectStats.day}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-orange-500" />
              <span className="text-xs text-muted-foreground">Prospects Week</span>
            </div>
            <p className="text-2xl font-bold mt-1">{prospectStats.week}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-rose-500/10 to-rose-500/5 border-rose-500/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-rose-500" />
              <span className="text-xs text-muted-foreground">Prospects Month</span>
            </div>
            <p className="text-2xl font-bold mt-1">{prospectStats.month}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Call Volume Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Call Volume Trend</CardTitle>
              <div className="flex gap-1">
                <button
                  onClick={() => setPeriod('day')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${period === 'day' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                >
                  Daily
                </button>
                <button
                  onClick={() => setPeriod('week')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${period === 'week' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                >
                  Weekly
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip contentStyle={customTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="answered" stackId="calls" fill="hsl(var(--chart-2))" name="Answered" radius={[0, 0, 0, 0]} />
                <Bar dataKey="missed" stackId="calls" fill="hsl(var(--chart-1))" name="Missed" radius={[4, 4, 0, 0]} />
                <Bar dataKey="prospects" fill="hsl(var(--chart-4))" name="Prospects" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Agent Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Agent Performance
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {period === 'day' ? 'Today' : period === 'week' ? 'This Week' : 'This Month'}
            </p>
          </CardHeader>
          <CardContent>
            {agentData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No call data for this period</p>
            ) : (
              <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                {agentData.map((agent, i) => {
                  const answerRate = agent.total > 0 ? Math.round((agent.answered / agent.total) * 100) : 0;
                  return (
                    <div key={agent.name} className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                      >
                        {agent.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate">{agent.name}</span>
                          <span className="text-xs text-muted-foreground">{agent.total} calls</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${answerRate}%`,
                                backgroundColor: answerRate >= 70 ? 'hsl(var(--chart-2))' : answerRate >= 40 ? 'hsl(var(--chart-5))' : 'hsl(var(--chart-1))',
                              }}
                            />
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <span className="text-[10px] text-green-500">{agent.answered}✓</span>
                            <span className="text-[10px] text-red-500">{agent.missed}✗</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Prospect trend line */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-amber-500" />
            Prospect Conversion from Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip contentStyle={customTooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="total" stroke="hsl(var(--chart-3))" strokeWidth={2} name="Total Calls" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="prospects" stroke="hsl(var(--chart-5))" strokeWidth={2} name="Prospects" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Sales vs Support Calls */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              Sales vs Support Calls (Daily)
            </CardTitle>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {(() => {
                const totals = salesVsSupportData.reduce((acc, d) => ({ sales: acc.sales + d.sales, support: acc.support + d.support, total: acc.total + d.total }), { sales: 0, support: 0, total: 0 });
                const salesPct = totals.total > 0 ? Math.round((totals.sales / totals.total) * 100) : 0;
                const supportPct = totals.total > 0 ? Math.round((totals.support / totals.total) * 100) : 0;
                return (
                  <>
                    <Badge variant="secondary" className="bg-chart-3/20 text-chart-3 border-chart-3/30">Sales {salesPct}%</Badge>
                    <Badge variant="secondary" className="bg-chart-1/20 text-chart-1 border-chart-1/30">Support {supportPct}%</Badge>
                  </>
                );
              })()}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={salesVsSupportData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip
                contentStyle={customTooltipStyle}
                formatter={(value: number, name: string, props: any) => {
                  const total = props.payload.total;
                  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                  return [`${value} (${pct}%)`, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="sales" stackId="dept" fill="hsl(var(--chart-3))" name="Sales" radius={[0, 0, 0, 0]} />
              <Bar dataKey="support" stackId="dept" fill="hsl(var(--chart-1))" name="Support" radius={[0, 0, 0, 0]} />
              <Bar dataKey="other" stackId="dept" fill="hsl(var(--chart-4))" name="Uncategorized" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
