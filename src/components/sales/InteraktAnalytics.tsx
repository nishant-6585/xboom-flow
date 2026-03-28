import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Target, Users, TrendingUp, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { format, startOfDay, startOfWeek, startOfMonth, eachDayOfInterval, subDays, subWeeks } from 'date-fns';
import type { InteraktLead } from '@/hooks/useInteraktLeads';
import type { Prospect } from '@/hooks/useProspects';

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

interface InteraktAnalyticsProps {
  leads: InteraktLead[];
  prospects: Prospect[];
}

function getLeadDate(lead: InteraktLead): Date {
  if (lead.interakt_created_at) return new Date(lead.interakt_created_at);
  return new Date(lead.created_at);
}

export function InteraktAnalytics({ leads, prospects }: InteraktAnalyticsProps) {
  const [period, setPeriod] = useState<'day' | 'week'>('week');

  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  const interaktProspects = useMemo(() => prospects.filter(p => p.source_type === 'interakt'), [prospects]);

  // Summary stats
  const stats = useMemo(() => {
    const compute = (start: Date) => leads.filter(l => getLeadDate(l) >= start).length;
    return { day: compute(todayStart), week: compute(weekStart), month: compute(monthStart) };
  }, [leads, todayStart, weekStart, monthStart]);

  const prospectStats = useMemo(() => ({
    day: interaktProspects.filter(p => new Date(p.created_at) >= todayStart).length,
    week: interaktProspects.filter(p => new Date(p.created_at) >= weekStart).length,
    month: interaktProspects.filter(p => new Date(p.created_at) >= monthStart).length,
  }), [interaktProspects, todayStart, weekStart, monthStart]);

  // Daily volume (last 14 days)
  const dailyData = useMemo(() => {
    const days = eachDayOfInterval({ start: subDays(now, 13), end: now });
    return days.map(day => {
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      const dayLeads = leads.filter(l => { const d = getLeadDate(l); return d >= day && d <= dayEnd; });
      const dayProspects = interaktProspects.filter(p => { const d = new Date(p.created_at); return d >= day && d <= dayEnd; });
      return {
        date: format(day, 'dd MMM'),
        messages: dayLeads.length,
        prospects: dayProspects.length,
      };
    });
  }, [leads, interaktProspects, now]);

  // Weekly data (last 8 weeks)
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
      const wLeads = leads.filter(l => { const d = getLeadDate(l); return d >= w.start && d <= w.end; });
      const wProsp = interaktProspects.filter(p => { const d = new Date(p.created_at); return d >= w.start && d <= w.end; });
      return { date: w.label, messages: wLeads.length, prospects: wProsp.length };
    });
  }, [leads, interaktProspects, now]);

  // Handler/salesperson breakdown
  const handlerData = useMemo(() => {
    const targetStart = period === 'day' ? todayStart : period === 'week' ? weekStart : monthStart;
    const filtered = leads.filter(l => getLeadDate(l) >= targetStart);
    const map = new Map<string, number>();
    for (const l of filtered) {
      const handler = l.updated_by ? 'Updated' : l.synced_by || 'Auto-sync';
      map.set(handler, (map.get(handler) || 0) + 1);
    }
    // Also count by status
    const statusMap = new Map<string, number>();
    for (const l of filtered) {
      statusMap.set(l.status, (statusMap.get(l.status) || 0) + 1);
    }
    return {
      handlers: Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      statuses: Array.from(statusMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    };
  }, [leads, period, todayStart, weekStart, monthStart]);

  const chartData = period === 'day' ? dailyData : weeklyData;

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    color: 'hsl(var(--foreground))',
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Today</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.day}</p>
            <span className="text-[10px] text-muted-foreground">messages</span>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">This Week</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.week}</p>
            <span className="text-[10px] text-muted-foreground">messages</span>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">This Month</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.month}</p>
            <span className="text-[10px] text-muted-foreground">messages</span>
          </CardContent>
        </Card>

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
        {/* Message Volume Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Message Volume Trend</CardTitle>
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
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="messages" fill="hsl(var(--chart-2))" name="Messages" radius={[4, 4, 0, 0]} />
                <Bar dataKey="prospects" fill="hsl(var(--chart-4))" name="Prospects" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Handler Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Lead Status Breakdown
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {period === 'day' ? 'Today' : period === 'week' ? 'This Week' : 'This Month'}
            </p>
          </CardHeader>
          <CardContent>
            {handlerData.statuses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data for this period</p>
            ) : (
              <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                {handlerData.statuses.map((item, i) => {
                  const total = handlerData.statuses.reduce((s, x) => s + x.count, 0);
                  const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                  return (
                    <div key={item.name} className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                      >
                        {item.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate capitalize">{item.name}</span>
                          <span className="text-xs text-muted-foreground">{item.count}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{pct}%</span>
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
            Prospect Conversion from Interakt
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="messages" stroke="hsl(var(--chart-3))" strokeWidth={2} name="Total Messages" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="prospects" stroke="hsl(var(--chart-5))" strokeWidth={2} name="Prospects" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
