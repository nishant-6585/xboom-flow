import { useState, useEffect, useMemo, useCallback } from 'react';
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
  Users, Clock, TrendingUp, TrendingDown, AlertTriangle, Award, Activity,
  Brain, Lightbulb, ArrowUpRight, ArrowDownRight, Minus, Zap, RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

interface EmployeeMetric {
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

interface Insight {
  type: 'underutilized' | 'overloaded' | 'trend' | 'risk' | 'optimization';
  message: string;
  impact: 'low' | 'medium' | 'high';
  recommendation: string;
  affectedEmployees?: string[];
  actionType?: 'reassign' | 'apply_template' | 'auto_optimize' | 'review';
}

interface TrendData {
  utilization: { current: number; previous: number; change: number };
  efficiency: { current: number; previous: number; change: number };
  gaps: { current: number; previous: number; change: number };
  activeEmployees: { current: number; previous: number; change: number };
}

interface MetricsResponse {
  metrics: EmployeeMetric[];
  summary: {
    avgUtilization: number;
    avgIdleTime: number;
    totalGaps: number;
    activeCount: number;
    totalCount: number;
  };
  heatmap: { grid: Record<string, Record<number, number>>; days: string[] };
  departments: string[];
  deptDistribution: { name: string; value: number }[];
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

const IMPACT_COLORS = {
  high: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800',
  medium: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  low: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800',
};

const INSIGHT_ICONS: Record<string, React.ReactNode> = {
  underutilized: <Users className="h-4 w-4" />,
  overloaded: <AlertTriangle className="h-4 w-4" />,
  trend: <TrendingUp className="h-4 w-4" />,
  risk: <Zap className="h-4 w-4" />,
  optimization: <Lightbulb className="h-4 w-4" />,
};

export function TeamProductivityDashboard() {
  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [prevData, setPrevData] = useState<MetricsResponse | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [dateFrom, setDateFrom] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const fetchMetrics = useCallback(async (from: string, to: string, dept: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return null;

    const { data: result, error } = await supabase.functions.invoke('compute-team-metrics', {
      body: { dateFrom: from, dateTo: to, department: dept },
    });
    if (error) throw error;
    return result as MetricsResponse;
  }, []);

  const fetchInsights = useCallback(async (current: EmployeeMetric[], previous: EmployeeMetric[] | null) => {
    setInsightsLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('analyze-team-productivity', {
        body: { currentMetrics: current, previousMetrics: previous },
      });
      if (error) throw error;
      setInsights(result.insights || []);
      setTrends(result.trends || null);
    } catch {
      // Insights are non-critical
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Calculate previous period (same duration shifted back)
      const fromDate = new Date(dateFrom);
      const toDate = new Date(dateTo);
      const durationDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
      const prevFrom = format(subDays(fromDate, durationDays + 1), 'yyyy-MM-dd');
      const prevTo = format(subDays(fromDate, 1), 'yyyy-MM-dd');

      const [currentResult, previousResult] = await Promise.all([
        fetchMetrics(dateFrom, dateTo, departmentFilter),
        fetchMetrics(prevFrom, prevTo, departmentFilter),
      ]);

      setData(currentResult);
      setPrevData(previousResult);

      if (currentResult) {
        fetchInsights(currentResult.metrics, previousResult?.metrics || null);
      }
    } catch (err: any) {
      toast.error('Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, departmentFilter, fetchMetrics, fetchInsights]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleAction = (actionType: string, affectedEmployees?: string[]) => {
    switch (actionType) {
      case 'apply_template':
        toast.info('Navigate to Template Library to assign templates to these employees');
        break;
      case 'reassign':
        toast.info(`Review workload for: ${affectedEmployees?.slice(0, 3).join(', ') || 'affected employees'}`);
        break;
      case 'auto_optimize':
        toast.info('Use Auto Optimize in individual employee flow views');
        break;
      default:
        toast.info('Review the affected employees in the team breakdown below');
    }
  };

  const activeEmployees = useMemo(() => data?.metrics.filter(e => e.uniqueDays > 0) || [], [data]);
  const topPerformers = activeEmployees.slice(0, 3);
  const underUtilized = useMemo(() =>
    [...activeEmployees].sort((a, b) => a.utilizationPct - b.utilizationPct).slice(0, 3),
    [activeEmployees]
  );

  const barChartData = useMemo(() =>
    activeEmployees.map(e => ({
      name: e.employeeName.split(' ')[0],
      fullName: e.employeeName,
      utilization: e.utilizationPct,
      efficiency: e.efficiencyScore,
    })),
    [activeEmployees]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
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
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {(data?.departments || []).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
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
          <Button variant="ghost" size="sm" onClick={fetchAll}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* AI Insights Panel */}
      {(insights.length > 0 || insightsLoading) && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              AI Insights
              {insightsLoading && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
              {insights.length > 0 && (
                <Badge variant="secondary" className="text-xs ml-2">
                  {insights.length} finding{insights.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {insightsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
              </div>
            ) : (
              insights.map((insight, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${IMPACT_COLORS[insight.impact]}`}
                >
                  <div className="mt-0.5">{INSIGHT_ICONS[insight.type]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{insight.message}</p>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {insight.impact}
                      </Badge>
                    </div>
                    <p className="text-xs mt-1 opacity-80">{insight.recommendation}</p>
                    {insight.affectedEmployees && insight.affectedEmployees.length > 0 && (
                      <p className="text-[11px] mt-1 opacity-60">
                        Affected: {insight.affectedEmployees.slice(0, 4).join(', ')}
                        {insight.affectedEmployees.length > 4 && ` +${insight.affectedEmployees.length - 4} more`}
                      </p>
                    )}
                  </div>
                  {insight.actionType && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-xs"
                      onClick={() => handleAction(insight.actionType!, insight.affectedEmployees)}
                    >
                      {insight.actionType === 'apply_template' ? 'Apply Template' :
                       insight.actionType === 'reassign' ? 'Reassign' :
                       insight.actionType === 'auto_optimize' ? 'Optimize' : 'Review'}
                      <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* KPI Cards with Trends */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={<Activity className="h-5 w-5" />}
          title="Avg Utilization"
          value={`${data?.summary.avgUtilization || 0}%`}
          subtitle={`${data?.summary.activeCount || 0} active employees`}
          color="text-primary"
          trend={trends?.utilization}
        />
        <KPICard
          icon={<Clock className="h-5 w-5" />}
          title="Avg Idle Time"
          value={`${data?.summary.avgIdleTime || 0}m`}
          subtitle="Per employee per day"
          color="text-amber-500"
          trend={null}
        />
        <KPICard
          icon={<AlertTriangle className="h-5 w-5" />}
          title="Total Gaps Found"
          value={`${data?.summary.totalGaps || 0}m`}
          subtitle="Across all employees"
          color="text-destructive"
          trend={trends?.gaps ? { ...trends.gaps, invertColor: true } : null}
        />
        <KPICard
          icon={<Award className="h-5 w-5" />}
          title="Avg Efficiency"
          value={`${trends?.efficiency?.current || 0}`}
          subtitle="Team efficiency score"
          color="text-primary"
          trend={trends?.efficiency}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Hours by Department</CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.deptDistribution?.length || 0) > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data!.deptDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}h`}
                    labelLine={false}
                  >
                    {data!.deptDistribution.map((_, idx) => (
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
      {data?.heatmap && (
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
                {data.heatmap.days.map(day => (
                  <div key={day} className="flex items-center">
                    <div className="w-12 text-xs text-muted-foreground font-medium">{day}</div>
                    {Array.from({ length: 13 }, (_, i) => i + 8).map(h => {
                      const count = data.heatmap.grid[day]?.[h] || 0;
                      const maxCount = Math.max(1, ...Object.values(data.heatmap.grid).flatMap(d => Object.values(d)));
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
      )}

      {/* Leaderboard & Needs Attention */}
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
                  }`}>#{idx + 1}</div>
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
            )) : <p className="text-sm text-muted-foreground">No data for this period</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" /> Needs Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {underUtilized.length > 0 ? underUtilized.map(emp => (
              <div key={emp.employeeId} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium text-sm">{emp.employeeName}</p>
                  <p className="text-xs text-muted-foreground">{emp.department}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{emp.utilizationPct}% utilized</Badge>
                  {emp.gapMinutes > 30 && <Badge variant="destructive" className="text-xs">{emp.gapMinutes}m gaps</Badge>}
                </div>
              </div>
            )) : <p className="text-sm text-muted-foreground">No data for this period</p>}
          </CardContent>
        </Card>
      </div>

      {/* Full Team Breakdown */}
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
                {(data?.metrics || []).map((emp, idx) => {
                  const isHighlighted = insights.some(i =>
                    i.impact === 'high' && i.affectedEmployees?.includes(emp.employeeName)
                  );
                  return (
                    <tr key={emp.employeeId} className={`border-b border-border/50 hover:bg-muted/30 ${isHighlighted ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}>
                      <td className="py-2 px-3 text-muted-foreground">{idx + 1}</td>
                      <td className="py-2 px-3 font-medium">
                        {emp.employeeName}
                        {isHighlighted && <AlertTriangle className="inline h-3 w-3 ml-1 text-destructive" />}
                      </td>
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
                  );
                })}
                {(!data?.metrics || data.metrics.length === 0) && (
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

function KPICard({ icon, title, value, subtitle, color, trend }: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
  color: string;
  trend?: { current: number; previous: number; change: number; invertColor?: boolean } | null;
}) {
  const isPositive = trend ? (trend.invertColor ? trend.change < 0 : trend.change > 0) : null;
  const isNeutral = trend?.change === 0;

  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className={`${color} p-2 rounded-lg bg-muted/50`}>{icon}</div>
            {trend && !isNeutral && (
              <div className={`flex items-center gap-0.5 text-[11px] font-medium ${
                isPositive ? 'text-green-600 dark:text-green-400' : 'text-destructive'
              }`}>
                {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(trend.change)}{typeof trend.current === 'number' && trend.current <= 100 ? '%' : ''}
              </div>
            )}
            {trend && isNeutral && (
              <div className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <Minus className="h-3 w-3" /> No change
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
