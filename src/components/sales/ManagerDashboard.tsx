import { useState } from "react";
import { BarChart3, Users, TrendingUp, Target, Calendar, Award, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SalesLeaderboard } from "./SalesLeaderboard";
import { LeadDistributionChart } from "./LeadDistributionChart";
import { SuggestionBox } from "./SuggestionBox";
import { WeightedForecastWidget } from "./WeightedForecastWidget";
import { CustomerTypeAnalytics } from "./CustomerTypeAnalytics";
import { useSalesLeaderboard } from "@/hooks/useSalesGamification";
import { useOrders } from "@/hooks/useOrders";
import { usePipelineOrders } from "@/hooks/usePipelineOrders";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
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
  PieChart,
  Pie,
  Cell,
} from "recharts";

export function ManagerDashboard() {
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const now = new Date();
  
  const startDate = period === 'week' 
    ? format(startOfWeek(now), 'yyyy-MM-dd')
    : format(startOfMonth(now), 'yyyy-MM-dd');
  const endDate = period === 'week'
    ? format(endOfWeek(now), 'yyyy-MM-dd')
    : format(endOfMonth(now), 'yyyy-MM-dd');

  const { leaderboard } = useSalesLeaderboard(startDate, endDate);
  const { orders } = useOrders();
  const { pipelineOrders } = usePipelineOrders();

  // Calculate team stats
  const totalLeads = leaderboard?.reduce((sum, e) => sum + e.leads_handled, 0) || 0;
  const totalOrders = leaderboard?.reduce((sum, e) => sum + e.orders_won, 0) || 0;
  const totalPipeline = leaderboard?.reduce((sum, e) => sum + Number(e.total_pipeline_value), 0) || 0;
  const totalPoints = leaderboard?.reduce((sum, e) => sum + e.total_points, 0) || 0;

  // Chart data
  const performanceData = leaderboard?.map(e => ({
    name: e.user_name.split(' ')[0],
    leads: e.leads_handled,
    orders: e.orders_won,
    points: e.total_points,
    orderValue: Number(e.total_order_value) / 1000, // in thousands
  })) || [];

  const pipelineStatusData = [
    { name: 'Won', value: pipelineOrders?.filter(p => p.status === 'won').length || 0, color: '#22c55e' },
    { name: 'Pending', value: pipelineOrders?.filter(p => p.status === 'pending_confirmation').length || 0, color: '#eab308' },
    { name: 'Negotiation', value: pipelineOrders?.filter(p => p.status === 'negotiation').length || 0, color: '#3b82f6' },
    { name: 'Lost', value: pipelineOrders?.filter(p => p.status === 'lost').length || 0, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // Order trends (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return format(date, 'yyyy-MM-dd');
  });

  const orderTrendData = last7Days.map(date => ({
    date: format(new Date(date), 'MMM d'),
    orders: orders?.filter(o => o.created_at.startsWith(date)).length || 0,
  }));

  return (
    <div className="space-y-6">
      {/* Period Toggle */}
      <div className="flex items-center gap-4">
        <Calendar className="w-5 h-5 text-muted-foreground" />
        <Tabs value={period} onValueChange={(v) => setPeriod(v as 'week' | 'month')}>
          <TabsList>
            <TabsTrigger value="week">This Week</TabsTrigger>
            <TabsTrigger value="month">This Month</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="overflow-hidden">
          <CardContent className="p-4 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5" />
              <span className="text-sm opacity-80">Team Leads</span>
            </div>
            <p className="text-3xl font-bold">{totalLeads}</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="p-4 bg-gradient-to-br from-green-500 to-emerald-600 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5" />
              <span className="text-sm opacity-80">Orders Won</span>
            </div>
            <p className="text-3xl font-bold">{totalOrders}</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="p-4 bg-gradient-to-br from-purple-500 to-violet-600 text-white">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5" />
              <span className="text-sm opacity-80">Pipeline Value</span>
            </div>
            <p className="text-3xl font-bold">₹{(totalPipeline / 100000).toFixed(1)}L</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="p-4 bg-gradient-to-br from-amber-500 to-orange-600 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5" />
              <span className="text-sm opacity-80">Team Points</span>
            </div>
            <p className="text-3xl font-bold">{totalPoints.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Performance Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Team Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="leads" fill="hsl(var(--primary))" name="Leads" radius={[4, 4, 0, 0]} />
                <Bar dataKey="orders" fill="#22c55e" name="Orders" radius={[4, 4, 0, 0]} />
                <Bar dataKey="orderValue" fill="#f59e0b" name="Order Value (₹K)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pipeline Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Pipeline Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pipelineStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pipelineStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Order Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              Order Trend (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={orderTrendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="orders" 
                  stroke="#22c55e" 
                  strokeWidth={3}
                  dot={{ fill: '#22c55e', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Lead Distribution by Salesperson */}
        <LeadDistributionChart startDate={startDate} endDate={endDate} />
      </div>

      {/* Leaderboard full-width */}
      <SalesLeaderboard startDate={startDate} endDate={endDate} />

      {/* Customer Type Analytics */}
      <CustomerTypeAnalytics />

      {/* Revenue Forecast */}
      <WeightedForecastWidget />

      {/* Suggestions */}
      <SuggestionBox />
    </div>
  );
}
