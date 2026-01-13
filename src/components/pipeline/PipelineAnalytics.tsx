import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { PipelineOrder, PIPELINE_STATUSES } from '@/hooks/usePipelineOrders';
import { format, parseISO, startOfWeek, endOfWeek, addDays, isWithinInterval, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { TrendingUp, DollarSign, Users, Calendar, Target, PieChartIcon } from 'lucide-react';

interface PipelineAnalyticsProps {
  orders: PipelineOrder[];
}

const COLORS = ['#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#f97316'];

export function PipelineAnalytics({ orders }: PipelineAnalyticsProps) {
  const analytics = useMemo(() => {
    const now = new Date();
    const pendingOrders = orders.filter(o => !['won', 'lost'].includes(o.status));
    
    // Total pipeline value (only pending orders)
    const totalPipelineValue = pendingOrders.reduce((sum, o) => sum + (o.expected_price || 0) * o.quantity, 0);
    
    // Won value
    const wonOrders = orders.filter(o => o.status === 'won');
    const wonValue = wonOrders.reduce((sum, o) => sum + (o.expected_price || 0) * o.quantity, 0);
    
    // Pipeline by sales person
    const bySalesPerson: Record<string, { name: string; value: number; count: number }> = {};
    pendingOrders.forEach(o => {
      if (!bySalesPerson[o.sales_person_id]) {
        bySalesPerson[o.sales_person_id] = { name: o.sales_person_name, value: 0, count: 0 };
      }
      bySalesPerson[o.sales_person_id].value += (o.expected_price || 0) * o.quantity;
      bySalesPerson[o.sales_person_id].count++;
    });
    const salesPersonData = Object.values(bySalesPerson).sort((a, b) => b.value - a.value);
    
    // Pipeline by status
    const byStatus: Record<string, { label: string; value: number; count: number }> = {};
    orders.forEach(o => {
      if (!byStatus[o.status]) {
        byStatus[o.status] = { 
          label: PIPELINE_STATUSES.find(s => s.value === o.status)?.label || o.status, 
          value: 0, 
          count: 0 
        };
      }
      byStatus[o.status].value += (o.expected_price || 0) * o.quantity;
      byStatus[o.status].count++;
    });
    const statusData = Object.values(byStatus);
    
    // Expected payments by week (next 4 weeks)
    const weeklyData: { week: string; value: number; count: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const weekStart = startOfWeek(addDays(now, i * 7), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      
      const weekOrders = pendingOrders.filter(o => {
        if (!o.expected_closure_date) return false;
        const closureDate = parseISO(o.expected_closure_date);
        return isWithinInterval(closureDate, { start: weekStart, end: weekEnd });
      });
      
      weeklyData.push({
        week: `Week ${i + 1} (${format(weekStart, 'dd MMM')})`,
        value: weekOrders.reduce((sum, o) => sum + (o.expected_price || 0) * o.quantity, 0),
        count: weekOrders.length,
      });
    }
    
    // Expected payments by month (next 3 months)
    const monthlyData: { month: string; value: number; count: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const monthDate = addMonths(now, i);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      
      const monthOrders = pendingOrders.filter(o => {
        if (!o.expected_closure_date) return false;
        const closureDate = parseISO(o.expected_closure_date);
        return isWithinInterval(closureDate, { start: monthStart, end: monthEnd });
      });
      
      monthlyData.push({
        month: format(monthDate, 'MMMM yyyy'),
        value: monthOrders.reduce((sum, o) => sum + (o.expected_price || 0) * o.quantity, 0),
        count: monthOrders.length,
      });
    }
    
    // Conversion rate
    const totalClosedOrders = orders.filter(o => ['won', 'lost'].includes(o.status)).length;
    const conversionRate = totalClosedOrders > 0 
      ? ((wonOrders.length / totalClosedOrders) * 100).toFixed(1) 
      : '0';
    
    return {
      totalPipelineValue,
      wonValue,
      pendingCount: pendingOrders.length,
      wonCount: wonOrders.length,
      conversionRate,
      salesPersonData,
      statusData,
      weeklyData,
      monthlyData,
    };
  }, [orders]);

  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${value.toFixed(0)}`;
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Pipeline Value</p>
                <p className="text-2xl font-bold">{formatCurrency(analytics.totalPipelineValue)}</p>
                <p className="text-sm text-muted-foreground">{analytics.pendingCount} pending orders</p>
              </div>
              <DollarSign className="h-10 w-10 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Won Value</p>
                <p className="text-2xl font-bold text-green-500">{formatCurrency(analytics.wonValue)}</p>
                <p className="text-sm text-muted-foreground">{analytics.wonCount} orders won</p>
              </div>
              <TrendingUp className="h-10 w-10 text-green-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Conversion Rate</p>
                <p className="text-2xl font-bold">{analytics.conversionRate}%</p>
                <p className="text-sm text-muted-foreground">Won vs Lost</p>
              </div>
              <Target className="h-10 w-10 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Sales Persons</p>
                <p className="text-2xl font-bold">{analytics.salesPersonData.length}</p>
                <p className="text-sm text-muted-foreground">With pipeline orders</p>
              </div>
              <Users className="h-10 w-10 text-purple-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline by Date Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Expected Pipeline by Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.weeklyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" fontSize={12} />
                <YAxis tickFormatter={formatCurrency} fontSize={12} />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), 'Pipeline Value']}
                  labelFormatter={(label) => `${label}`}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Expected Pipeline by Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis tickFormatter={formatCurrency} fontSize={12} />
                <Tooltip 
                  formatter={(value: number, name) => [formatCurrency(value), 'Pipeline Value']}
                />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline by Sales Person */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Pipeline Value by Sales Person
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analytics.salesPersonData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={formatCurrency} fontSize={12} />
              <YAxis dataKey="name" type="category" width={120} fontSize={12} />
              <Tooltip 
                formatter={(value: number) => [formatCurrency(value), 'Pipeline Value']}
                labelFormatter={(label) => `${label}`}
              />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {/* Summary table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Sales Person</th>
                  <th className="text-right py-2">Orders</th>
                  <th className="text-right py-2">Pipeline Value</th>
                </tr>
              </thead>
              <tbody>
                {analytics.salesPersonData.map((sp, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-2">{sp.name}</td>
                    <td className="text-right py-2">{sp.count}</td>
                    <td className="text-right py-2 font-medium">{formatCurrency(sp.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pipeline by Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChartIcon className="h-5 w-5" />
            Pipeline by Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analytics.statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ label, percent }) => `${label} (${(percent * 100).toFixed(0)}%)`}
                >
                  {analytics.statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col justify-center space-y-2">
              {analytics.statusData.map((status, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span>{status.label}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium">{formatCurrency(status.value)}</span>
                    <span className="text-muted-foreground ml-2">({status.count})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
