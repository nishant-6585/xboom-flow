import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Users,
  Phone,
  Mail,
  Calendar,
  TrendingUp,
  Activity,
  Target,
  Zap,
} from 'lucide-react';
import { useSalesDailyActivities, useOutboundActivities } from '@/hooks/useSalesGamification';
import { useAuth } from '@/hooks/useAuth';
import { format, subDays, startOfWeek, endOfWeek, isWithinInterval, parseISO } from 'date-fns';

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
];

interface SalesPersonActivity {
  user_id: string;
  user_name: string;
  leads_handled: number;
  pipeline_created: number;
  orders_won: number;
  calls_made: number;
  emails_sent: number;
  meetings_scheduled: number;
  demos_given: number;
  follow_ups: number;
  new_contacts: number;
  activity_days: number;
}

export function DailyActivityAnalytics() {
  const { role } = useAuth();
  const { activities: dailyActivities, isLoading: dailyLoading } = useSalesDailyActivities();
  const { activities: outboundActivities, isLoading: outboundLoading } = useOutboundActivities();
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter'>('week');

  const isManager = role === 'admin' || role === 'supply_chain';

  // Calculate date range boundaries
  const dateRangeBounds = useMemo(() => {
    const now = new Date();
    let start: Date;
    
    switch (dateRange) {
      case 'week':
        start = startOfWeek(now, { weekStartsOn: 1 });
        break;
      case 'month':
        start = subDays(now, 30);
        break;
      case 'quarter':
        start = subDays(now, 90);
        break;
      default:
        start = startOfWeek(now, { weekStartsOn: 1 });
    }
    
    return { start, end: now };
  }, [dateRange]);

  // Filter activities by date range
  const filteredDailyActivities = useMemo(() => {
    return (dailyActivities || []).filter(a => {
      const activityDate = parseISO(a.activity_date);
      return isWithinInterval(activityDate, dateRangeBounds);
    });
  }, [dailyActivities, dateRangeBounds]);

  const filteredOutboundActivities = useMemo(() => {
    return (outboundActivities || []).filter(a => {
      const activityDate = parseISO(a.activity_date);
      return isWithinInterval(activityDate, dateRangeBounds);
    });
  }, [outboundActivities, dateRangeBounds]);

  // Aggregate by salesperson
  const salesPersonStats = useMemo(() => {
    const statsMap = new Map<string, SalesPersonActivity>();

    // Process daily activities
    filteredDailyActivities.forEach(activity => {
      const existing = statsMap.get(activity.user_id) || {
        user_id: activity.user_id,
        user_name: 'Unknown',
        leads_handled: 0,
        pipeline_created: 0,
        orders_won: 0,
        calls_made: 0,
        emails_sent: 0,
        meetings_scheduled: 0,
        demos_given: 0,
        follow_ups: 0,
        new_contacts: 0,
        activity_days: 0,
      };

      existing.leads_handled += activity.leads_handled || 0;
      existing.pipeline_created += activity.pipeline_created || 0;
      existing.orders_won += activity.orders_won || 0;
      existing.activity_days += 1;

      statsMap.set(activity.user_id, existing);
    });

    // Process outbound activities
    filteredOutboundActivities.forEach(activity => {
      const existing = statsMap.get(activity.user_id) || {
        user_id: activity.user_id,
        user_name: activity.user_name,
        leads_handled: 0,
        pipeline_created: 0,
        orders_won: 0,
        calls_made: 0,
        emails_sent: 0,
        meetings_scheduled: 0,
        demos_given: 0,
        follow_ups: 0,
        new_contacts: 0,
        activity_days: 0,
      };

      existing.user_name = activity.user_name;
      existing.calls_made += activity.calls_made || 0;
      existing.emails_sent += activity.emails_sent || 0;
      existing.meetings_scheduled += activity.meetings_scheduled || 0;
      existing.demos_given += activity.demos_given || 0;
      existing.follow_ups += activity.follow_ups || 0;
      existing.new_contacts += activity.new_contacts || 0;

      statsMap.set(activity.user_id, existing);
    });

    return Array.from(statsMap.values()).sort((a, b) => 
      (b.leads_handled + b.calls_made + b.emails_sent) - 
      (a.leads_handled + a.calls_made + a.emails_sent)
    );
  }, [filteredDailyActivities, filteredOutboundActivities]);

  // Daily trend data
  const dailyTrendData = useMemo(() => {
    const dateMap = new Map<string, { date: string; leads: number; calls: number; emails: number; meetings: number }>();
    
    // Initialize dates
    let currentDate = new Date(dateRangeBounds.start);
    while (currentDate <= dateRangeBounds.end) {
      const dateStr = format(currentDate, 'MMM d');
      dateMap.set(format(currentDate, 'yyyy-MM-dd'), { 
        date: dateStr, 
        leads: 0, 
        calls: 0, 
        emails: 0,
        meetings: 0 
      });
      currentDate = new Date(currentDate.setDate(currentDate.getDate() + 1));
    }

    // Aggregate daily activities
    filteredDailyActivities.forEach(activity => {
      const existing = dateMap.get(activity.activity_date);
      if (existing) {
        existing.leads += activity.leads_handled || 0;
      }
    });

    // Aggregate outbound activities
    filteredOutboundActivities.forEach(activity => {
      const existing = dateMap.get(activity.activity_date);
      if (existing) {
        existing.calls += activity.calls_made || 0;
        existing.emails += activity.emails_sent || 0;
        existing.meetings += activity.meetings_scheduled || 0;
      }
    });

    return Array.from(dateMap.values());
  }, [filteredDailyActivities, filteredOutboundActivities, dateRangeBounds]);

  // Activity type distribution
  const activityDistribution = useMemo(() => {
    const totals = salesPersonStats.reduce(
      (acc, person) => ({
        leads: acc.leads + person.leads_handled,
        calls: acc.calls + person.calls_made,
        emails: acc.emails + person.emails_sent,
        meetings: acc.meetings + person.meetings_scheduled,
        demos: acc.demos + person.demos_given,
        followups: acc.followups + person.follow_ups,
      }),
      { leads: 0, calls: 0, emails: 0, meetings: 0, demos: 0, followups: 0 }
    );

    return [
      { name: 'Leads Handled', value: totals.leads, icon: Target },
      { name: 'Calls Made', value: totals.calls, icon: Phone },
      { name: 'Emails Sent', value: totals.emails, icon: Mail },
      { name: 'Meetings', value: totals.meetings, icon: Calendar },
      { name: 'Demos', value: totals.demos, icon: Zap },
      { name: 'Follow-ups', value: totals.followups, icon: Activity },
    ].filter(item => item.value > 0);
  }, [salesPersonStats]);

  // Overall totals
  const totalMetrics = useMemo(() => {
    return salesPersonStats.reduce(
      (acc, person) => ({
        totalLeads: acc.totalLeads + person.leads_handled,
        totalCalls: acc.totalCalls + person.calls_made,
        totalEmails: acc.totalEmails + person.emails_sent,
        totalMeetings: acc.totalMeetings + person.meetings_scheduled,
        totalPipeline: acc.totalPipeline + person.pipeline_created,
        activeSalespeople: acc.activeSalespeople + 1,
      }),
      { totalLeads: 0, totalCalls: 0, totalEmails: 0, totalMeetings: 0, totalPipeline: 0, activeSalespeople: 0 }
    );
  }, [salesPersonStats]);

  const loading = dailyLoading || outboundLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">Loading activity analytics...</div>
      </div>
    );
  }

  if (!isManager) {
    return null; // Only show for managers
  }

  return (
    <div className="space-y-6">
      {/* Header with date range selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Users className="w-5 h-5" />
          Sales Team Daily Activity
        </h3>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as 'week' | 'month' | 'quarter')}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">Last 30 Days</SelectItem>
            <SelectItem value="quarter">Last 90 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Reps</p>
                <p className="text-xl font-bold">{totalMetrics.activeSalespeople}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Target className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Leads Handled</p>
                <p className="text-xl font-bold">{totalMetrics.totalLeads}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Phone className="w-4 h-4 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Calls Made</p>
                <p className="text-xl font-bold">{totalMetrics.totalCalls}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Mail className="w-4 h-4 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Emails Sent</p>
                <p className="text-xl font-bold">{totalMetrics.totalEmails}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Calendar className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Meetings</p>
                <p className="text-xl font-bold">{totalMetrics.totalMeetings}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pipeline Added</p>
                <p className="text-xl font-bold">{totalMetrics.totalPipeline}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity by Salesperson */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="w-5 h-5" />
              Activity by Salesperson
            </CardTitle>
          </CardHeader>
          <CardContent>
            {salesPersonStats.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                <div className="text-center">
                  <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No activity data for this period</p>
                  <p className="text-sm">Sales team can log activities in the Activity tab</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={salesPersonStats.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis 
                    type="category" 
                    dataKey="user_name" 
                    width={80}
                    className="text-xs"
                    tickFormatter={(name) => name.split(' ')[0]}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="leads_handled" name="Leads" fill="hsl(var(--primary))" stackId="a" />
                  <Bar dataKey="calls_made" name="Calls" fill="hsl(var(--chart-2))" stackId="a" />
                  <Bar dataKey="emails_sent" name="Emails" fill="hsl(var(--chart-3))" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Activity Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="w-5 h-5" />
              Activity Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityDistribution.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No activity data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={activityDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => 
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                    labelLine={false}
                  >
                    {activityDistribution.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="w-5 h-5" />
            Daily Activity Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={dailyTrendData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                className="text-xs"
                interval="preserveStartEnd"
              />
              <YAxis className="text-xs" />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="leads" 
                name="Leads" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))' }}
              />
              <Line 
                type="monotone" 
                dataKey="calls" 
                name="Calls" 
                stroke="hsl(var(--chart-2))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--chart-2))' }}
              />
              <Line 
                type="monotone" 
                dataKey="emails" 
                name="Emails" 
                stroke="hsl(var(--chart-3))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--chart-3))' }}
              />
              <Line 
                type="monotone" 
                dataKey="meetings" 
                name="Meetings" 
                stroke="hsl(var(--chart-4))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--chart-4))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Salesperson Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5" />
            Individual Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {salesPersonStats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No salesperson activity data available</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Salesperson</th>
                    <th className="text-center py-2 px-2 font-medium">Leads</th>
                    <th className="text-center py-2 px-2 font-medium">Pipeline</th>
                    <th className="text-center py-2 px-2 font-medium">Calls</th>
                    <th className="text-center py-2 px-2 font-medium">Emails</th>
                    <th className="text-center py-2 px-2 font-medium">Meetings</th>
                    <th className="text-center py-2 px-2 font-medium">Demos</th>
                    <th className="text-center py-2 px-2 font-medium">Follow-ups</th>
                    <th className="text-center py-2 px-2 font-medium">Days Active</th>
                  </tr>
                </thead>
                <tbody>
                  {salesPersonStats.map((person, index) => (
                    <tr 
                      key={person.user_id} 
                      className={`border-b last:border-0 ${index % 2 === 0 ? 'bg-muted/30' : ''}`}
                    >
                      <td className="py-2 px-3 font-medium">{person.user_name || 'Unknown'}</td>
                      <td className="text-center py-2 px-2">{person.leads_handled}</td>
                      <td className="text-center py-2 px-2">{person.pipeline_created}</td>
                      <td className="text-center py-2 px-2">{person.calls_made}</td>
                      <td className="text-center py-2 px-2">{person.emails_sent}</td>
                      <td className="text-center py-2 px-2">{person.meetings_scheduled}</td>
                      <td className="text-center py-2 px-2">{person.demos_given}</td>
                      <td className="text-center py-2 px-2">{person.follow_ups}</td>
                      <td className="text-center py-2 px-2">{person.activity_days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
