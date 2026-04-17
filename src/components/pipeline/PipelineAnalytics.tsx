import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { PipelineOrder, PIPELINE_STATUSES } from '@/hooks/usePipelineOrders';
import { format, parseISO, startOfWeek, endOfWeek, addDays, isWithinInterval, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { TrendingUp, DollarSign, Users, Calendar, Target, PieChartIcon, FolderOpen } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface PipelineAnalyticsProps {
  orders: PipelineOrder[];
  onCardClick?: (filter: { type: string; value: string }) => void;
}

const COLORS = ['#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#f97316', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#6366f1'];

interface DrillDown {
  title: string;
  orders: PipelineOrder[];
}

export function PipelineAnalytics({ orders, onCardClick }: PipelineAnalyticsProps) {
  const { role, user } = useAuth();
  const [drill, setDrill] = useState<DrillDown | null>(null);
  
  // Filter orders for sales role - only show their own pipeline
  const filteredOrders = useMemo(() => {
    if (role === 'sales' && user) {
      return orders.filter(o => o.sales_person_id === user.id);
    }
    return orders;
  }, [orders, role, user]);
  
  const isSalesView = role === 'sales';
  const analytics = useMemo(() => {
    const now = new Date();
    const pendingOrders = filteredOrders.filter(o => !['won', 'lost'].includes(o.status));
    
    const totalPipelineValue = pendingOrders.reduce((sum, o) => sum + (o.expected_price || 0) * o.quantity, 0);
    
    const wonOrders = filteredOrders.filter(o => o.status === 'won');
    const wonValue = wonOrders.reduce((sum, o) => sum + (o.expected_price || 0) * o.quantity, 0);
    
    const bySalesPerson: Record<string, { name: string; value: number; count: number; spId: string }> = {};
    if (!isSalesView) {
      pendingOrders.forEach(o => {
        if (!bySalesPerson[o.sales_person_id]) {
          bySalesPerson[o.sales_person_id] = { name: o.sales_person_name, value: 0, count: 0, spId: o.sales_person_id };
        }
        bySalesPerson[o.sales_person_id].value += (o.expected_price || 0) * o.quantity;
        bySalesPerson[o.sales_person_id].count++;
      });
    }
    const salesPersonData = Object.values(bySalesPerson).sort((a, b) => b.value - a.value);
    
    const byStatus: Record<string, { label: string; value: number; count: number; statusKey: string }> = {};
    filteredOrders.forEach(o => {
      if (!byStatus[o.status]) {
        byStatus[o.status] = { 
          label: PIPELINE_STATUSES.find(s => s.value === o.status)?.label || o.status, 
          value: 0, 
          count: 0,
          statusKey: o.status,
        };
      }
      byStatus[o.status].value += (o.expected_price || 0) * o.quantity;
      byStatus[o.status].count++;
    });
    const statusData = Object.values(byStatus);
    
    const byCategory: Record<string, { category: string; value: number; count: number }> = {};
    pendingOrders.forEach(o => {
      const category = o.product_category || 'Uncategorized';
      if (!byCategory[category]) {
        byCategory[category] = { category, value: 0, count: 0 };
      }
      byCategory[category].value += (o.expected_price || 0) * o.quantity;
      byCategory[category].count++;
    });
    const categoryData = Object.values(byCategory).sort((a, b) => b.value - a.value);
    
    const weeklyData: { week: string; value: number; count: number; weekIndex: number }[] = [];
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
        weekIndex: i,
      });
    }
    
    const monthlyData: { month: string; value: number; count: number; monthIndex: number }[] = [];
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
        monthIndex: i,
      });
    }
    
    const totalClosedOrders = filteredOrders.filter(o => ['won', 'lost'].includes(o.status)).length;
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
      categoryData,
      weeklyData,
      monthlyData,
      pendingOrders,
    };
  }, [filteredOrders, isSalesView]);

  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${value.toFixed(0)}`;
  };

  // Drill-down handlers
  const drillBySalesPerson = (spId: string, name: string) => {
    const list = analytics.pendingOrders.filter(o => o.sales_person_id === spId);
    setDrill({ title: `Pipeline · ${name} (${list.length})`, orders: list });
  };
  const drillByCategory = (category: string) => {
    const list = analytics.pendingOrders.filter(o => (o.product_category || 'Uncategorized') === category);
    setDrill({ title: `Category · ${category} (${list.length})`, orders: list });
  };
  const drillByStatus = (statusKey: string, label: string) => {
    const list = filteredOrders.filter(o => o.status === statusKey);
    setDrill({ title: `Status · ${label} (${list.length})`, orders: list });
  };
  const drillByWeek = (weekIndex: number, weekLabel: string) => {
    const now = new Date();
    const weekStart = startOfWeek(addDays(now, weekIndex * 7), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const list = analytics.pendingOrders.filter(o => {
      if (!o.expected_closure_date) return false;
      return isWithinInterval(parseISO(o.expected_closure_date), { start: weekStart, end: weekEnd });
    });
    setDrill({ title: `Closures · ${weekLabel} (${list.length})`, orders: list });
  };
  const drillByMonth = (monthIndex: number, monthLabel: string) => {
    const now = new Date();
    const monthDate = addMonths(now, monthIndex);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const list = analytics.pendingOrders.filter(o => {
      if (!o.expected_closure_date) return false;
      return isWithinInterval(parseISO(o.expected_closure_date), { start: monthStart, end: monthEnd });
    });
    setDrill({ title: `Closures · ${monthLabel} (${list.length})`, orders: list });
  };

  return (
    <div className="space-y-6">
      {isSalesView && (
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
          Showing analytics for your pipeline only
        </div>
      )}
      {/* Summary Cards */}
      <div className={`grid gap-4 md:grid-cols-2 ${isSalesView ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        <Card 
          className={`${onCardClick ? 'cursor-pointer hover:scale-105 hover:shadow-lg transition-all hover:ring-2 hover:ring-primary/50' : ''}`}
          onClick={() => onCardClick?.({ type: 'status', value: 'pending' })}
        >
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
        <Card 
          className={`${onCardClick ? 'cursor-pointer hover:scale-105 hover:shadow-lg transition-all hover:ring-2 hover:ring-primary/50' : ''}`}
          onClick={() => onCardClick?.({ type: 'status', value: 'won' })}
        >
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
        <Card 
          className={`${onCardClick ? 'cursor-pointer hover:scale-105 hover:shadow-lg transition-all hover:ring-2 hover:ring-primary/50' : ''}`}
          onClick={() => onCardClick?.({ type: 'view', value: 'all' })}
        >
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
        {!isSalesView && (
          <Card 
            className={`${onCardClick ? 'cursor-pointer hover:scale-105 hover:shadow-lg transition-all hover:ring-2 hover:ring-primary/50' : ''}`}
            onClick={() => onCardClick?.({ type: 'view', value: 'all' })}
          >
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
        )}
      </div>

      {/* Pipeline by Date Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Expected Pipeline by Week
              <span className="text-xs font-normal text-muted-foreground ml-auto">Click bars for details</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.weeklyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" fontSize={12} />
                <YAxis tickFormatter={formatCurrency} fontSize={12} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), 'Pipeline Value']} />
                <Bar
                  dataKey="value"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(d: any) => drillByWeek(d.weekIndex, d.week)}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Expected Pipeline by Month
              <span className="text-xs font-normal text-muted-foreground ml-auto">Click points for details</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis tickFormatter={formatCurrency} fontSize={12} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), 'Pipeline Value']} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 6, cursor: 'pointer' }}
                  activeDot={{ r: 8, cursor: 'pointer', onClick: (_e: any, payload: any) => drillByMonth(payload?.payload?.monthIndex, payload?.payload?.month) }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline by Sales Person */}
      {!isSalesView && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Pipeline Value by Sales Person
              <span className="text-xs font-normal text-muted-foreground ml-auto">Click bars or rows for details</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.salesPersonData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={formatCurrency} fontSize={12} />
                <YAxis dataKey="name" type="category" width={120} fontSize={12} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), 'Pipeline Value']} />
                <Bar
                  dataKey="value"
                  fill="hsl(var(--primary))"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(d: any) => drillBySalesPerson(d.spId, d.name)}
                />
              </BarChart>
            </ResponsiveContainer>
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
                    <tr
                      key={idx}
                      className="border-b last:border-0 cursor-pointer hover:bg-muted/50"
                      onClick={() => drillBySalesPerson(sp.spId, sp.name)}
                    >
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
      )}

      {/* Pipeline by Category */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Pipeline by Product Category
            <span className="text-xs font-normal text-muted-foreground ml-auto">Click bars or rows for details</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.categoryData.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={formatCurrency} fontSize={12} />
                <YAxis dataKey="category" type="category" width={120} fontSize={11} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), 'Pipeline Value']} />
                <Bar
                  dataKey="value"
                  fill="hsl(var(--primary))"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(d: any) => drillByCategory(d.category)}
                />
              </BarChart>
            </ResponsiveContainer>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Category</th>
                    <th className="text-right py-2">Orders</th>
                    <th className="text-right py-2">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.categoryData.map((cat, idx) => (
                    <tr
                      key={idx}
                      className="border-b last:border-0 cursor-pointer hover:bg-muted/50"
                      onClick={() => drillByCategory(cat.category)}
                    >
                      <td className="py-2">{cat.category}</td>
                      <td className="text-right py-2">{cat.count}</td>
                      <td className="text-right py-2 font-medium">{formatCurrency(cat.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pipeline by Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChartIcon className="h-5 w-5" />
            Pipeline by Status
            <span className="text-xs font-normal text-muted-foreground ml-auto">Click slices or rows for details</span>
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
                  cursor="pointer"
                  onClick={(d: any) => drillByStatus(d.statusKey, d.label)}
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
                <div
                  key={idx}
                  className="flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded px-2 py-1"
                  onClick={() => drillByStatus(status.statusKey, status.label)}
                >
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

      {/* Drill-down dialog */}
      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{drill?.title}</DialogTitle>
          </DialogHeader>
          {drill && drill.orders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No matching pipeline orders.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sales Person</TableHead>
                  <TableHead>Closure</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drill?.orders.map(o => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <div className="font-medium">{o.customer_name}</div>
                      <div className="text-xs text-muted-foreground">{o.customer_company}</div>
                    </TableCell>
                    <TableCell className="text-sm">{o.product_name}</TableCell>
                    <TableCell className="text-right">{o.quantity}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency((o.expected_price || 0) * o.quantity)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {PIPELINE_STATUSES.find(s => s.value === o.status)?.label || o.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{o.sales_person_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {o.expected_closure_date ? format(parseISO(o.expected_closure_date), 'dd MMM yyyy') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
