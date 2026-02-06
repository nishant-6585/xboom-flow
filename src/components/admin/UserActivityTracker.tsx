import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useComprehensiveUserActivity, ComprehensiveUserActivity } from '@/hooks/useUserActivity';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { Activity, Clock, Users, TrendingDown, Target, CheckCircle, Ticket, Calendar, AlertTriangle } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)', 'hsl(262, 83%, 58%)', 'hsl(199, 89%, 48%)'];

type TimeRange = 'today' | 'week' | 'month' | 'lastMonth' | 'all';

export default function UserActivityTracker() {
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [activeTab, setActiveTab] = useState('overview');

  const getDateRange = () => {
    const today = new Date();
    switch (timeRange) {
      case 'today':
        return { start: format(today, 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
      case 'week':
        return { start: format(subDays(today, 7), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
      case 'month':
        return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(endOfMonth(today), 'yyyy-MM-dd') };
      case 'lastMonth':
        const lastMonth = subMonths(today, 1);
        return { start: format(startOfMonth(lastMonth), 'yyyy-MM-dd'), end: format(endOfMonth(lastMonth), 'yyyy-MM-dd') };
      default:
        return { start: undefined, end: undefined };
    }
  };

  const { start, end } = getDateRange();
  const { data: activities, isLoading } = useComprehensiveUserActivity(start, end);

  // Get least active users (bottom 5 by usage)
  const leastActiveUsers = [...(activities || [])]
    .sort((a, b) => a.total_usage_minutes - b.total_usage_minutes)
    .slice(0, 5);

  // Get most active users (top 5 by usage)
  const mostActiveUsers = [...(activities || [])]
    .sort((a, b) => b.total_usage_minutes - a.total_usage_minutes)
    .slice(0, 5);

  // Prepare chart data
  const usageChartData = (activities || [])
    .map(a => ({
      name: a.user_name.split(' ')[0],
      fullName: a.user_name,
      usage: Math.round(a.total_usage_minutes / 60 * 10) / 10,
      sessions: a.total_sessions,
    }))
    .sort((a, b) => b.usage - a.usage)
    .slice(0, 10);

  const salesChartData = (activities || [])
    .filter(a => a.orders_won > 0 || a.leads_handled > 0 || a.pipeline_created > 0)
    .map(a => ({
      name: a.user_name.split(' ')[0],
      fullName: a.user_name,
      leads: a.leads_handled,
      orders: a.orders_won,
      pipeline: a.pipeline_created,
    }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 10);

  const attendanceChartData = (activities || [])
    .filter(a => a.present_days > 0 || a.total_working_hours > 0)
    .map(a => ({
      name: a.user_name.split(' ')[0],
      fullName: a.user_name,
      days: a.present_days,
      hours: a.total_working_hours,
    }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 10);

  const taskChartData = (activities || [])
    .filter(a => a.tasks_completed > 0 || a.tasks_pending > 0)
    .map(a => ({
      name: a.user_name.split(' ')[0],
      fullName: a.user_name,
      completed: a.tasks_completed,
      pending: a.tasks_pending,
    }))
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 10);

  const ticketChartData = (activities || [])
    .filter(a => a.tickets_raised > 0 || a.tickets_resolved > 0)
    .map(a => ({
      name: a.user_name.split(' ')[0],
      fullName: a.user_name,
      raised: a.tickets_raised,
      resolved: a.tickets_resolved,
    }))
    .sort((a, b) => b.resolved - a.resolved)
    .slice(0, 10);

  // Calculate totals
  const totals = (activities || []).reduce(
    (acc, a) => ({
      usage: acc.usage + a.total_usage_minutes,
      sessions: acc.sessions + a.total_sessions,
      leads: acc.leads + a.leads_handled,
      orders: acc.orders + a.orders_won,
      tasks: acc.tasks + a.tasks_completed,
      tickets: acc.tickets + a.tickets_resolved,
    }),
    { usage: 0, sessions: 0, leads: 0, orders: 0, tasks: 0, tickets: 0 }
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with time filter */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            User Activity Tracker
          </h2>
          <p className="text-sm text-muted-foreground">Monitor team engagement and productivity</p>
        </div>
        <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">Last 7 Days</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="lastMonth">Last Month</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold">{activities?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Total Users</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-6 w-6 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold">{Math.round(totals.usage / 60)}h</p>
            <p className="text-xs text-muted-foreground">Total Usage</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Activity className="h-6 w-6 mx-auto mb-2 text-green-500" />
            <p className="text-2xl font-bold">{totals.sessions}</p>
            <p className="text-xs text-muted-foreground">Sessions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Target className="h-6 w-6 mx-auto mb-2 text-orange-500" />
            <p className="text-2xl font-bold">{totals.leads}</p>
            <p className="text-xs text-muted-foreground">Leads Handled</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-6 w-6 mx-auto mb-2 text-emerald-500" />
            <p className="text-2xl font-bold">{totals.tasks}</p>
            <p className="text-xs text-muted-foreground">Tasks Done</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Ticket className="h-6 w-6 mx-auto mb-2 text-purple-500" />
            <p className="text-2xl font-bold">{totals.tickets}</p>
            <p className="text-xs text-muted-foreground">Tickets Resolved</p>
          </CardContent>
        </Card>
      </div>

      {/* Least Active Users Alert */}
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Top 5 Least Active Users
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {leastActiveUsers.map((user, index) => (
              <div key={user.user_id} className="flex items-center gap-3 p-3 bg-background rounded-lg border">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center text-destructive font-semibold">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{user.user_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.total_usage_minutes < 60
                      ? `${user.total_usage_minutes}m usage`
                      : `${Math.round(user.total_usage_minutes / 60 * 10) / 10}h usage`}
                  </p>
                </div>
              </div>
            ))}
            {leastActiveUsers.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-full text-center py-4">No activity data available</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different views */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Top Active Users */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Most Active Users (by Usage Hours)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={usageChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="name" type="category" width={60} tick={{ fontSize: 11 }} />
                      <Tooltip 
                        formatter={(value, name) => [name === 'usage' ? `${value}h` : value, name === 'usage' ? 'Hours' : 'Sessions']}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName}
                      />
                      <Bar dataKey="usage" fill="hsl(var(--primary))" name="Hours" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Activity Distribution Pie */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Activity Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Leads', value: totals.leads },
                          { name: 'Orders', value: totals.orders },
                          { name: 'Tasks', value: totals.tasks },
                          { name: 'Tickets', value: totals.tickets },
                        ].filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {COLORS.map((color, index) => (
                          <Cell key={`cell-${index}`} fill={color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">User Sessions & Usage Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={usageChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                    <Tooltip 
                      formatter={(value, name) => [name === 'usage' ? `${value}h` : value, name === 'usage' ? 'Hours' : 'Sessions']}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="usage" fill="hsl(var(--primary))" name="Hours" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="sessions" fill="hsl(var(--secondary))" name="Sessions" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Sales Performance by User</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName} />
                    <Legend />
                    <Bar dataKey="leads" fill="hsl(199, 89%, 48%)" name="Leads" stackId="a" />
                    <Bar dataKey="pipeline" fill="hsl(38, 92%, 50%)" name="Pipeline" stackId="a" />
                    <Bar dataKey="orders" fill="hsl(142, 76%, 36%)" name="Orders" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Attendance & Working Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={attendanceChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                    <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="days" fill="hsl(var(--primary))" name="Present Days" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="hours" fill="hsl(142, 76%, 36%)" name="Working Hours" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Task Completion by User</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={taskChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName} />
                      <Legend />
                      <Bar dataKey="completed" fill="hsl(142, 76%, 36%)" name="Completed" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="pending" fill="hsl(38, 92%, 50%)" name="Pending" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Ticket Activity by User</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ticketChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName} />
                      <Legend />
                      <Bar dataKey="raised" fill="hsl(0, 84%, 60%)" name="Raised" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="resolved" fill="hsl(142, 76%, 36%)" name="Resolved" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
