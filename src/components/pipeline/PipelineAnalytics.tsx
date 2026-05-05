import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { PipelineOrder, PIPELINE_STATUSES } from '@/hooks/usePipelineOrders';
import { format, parseISO, startOfWeek, endOfWeek, addDays, isWithinInterval, startOfMonth, endOfMonth, addMonths, endOfDay, startOfDay } from 'date-fns';
import { TrendingUp, DollarSign, Users, Calendar, Target, PieChartIcon, FolderOpen, Filter, Download } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

interface PipelineAnalyticsProps {
  orders: PipelineOrder[];
  onCardClick?: (filter: { type: string; value: string }) => void;
}

const COLORS = ['#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#f97316', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#6366f1'];

export function PipelineAnalytics({ orders, onCardClick }: PipelineAnalyticsProps) {
  const { role, user } = useAuth();
  
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const isSalesView = role === 'sales';

  // Available sales persons for filter dropdown (only for non-sales roles)
  const availableSalesPersons = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach(o => {
      if (o.sales_person_id && !map.has(o.sales_person_id)) {
        map.set(o.sales_person_id, o.sales_person_name || 'Unknown');
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  // Filter orders for sales role - only show their own pipeline
  const filteredOrders = useMemo(() => {
    let result = orders;
    if (role === 'sales' && user) {
      result = result.filter(o => o.sales_person_id === user.id);
    } else if (salesPersonFilter !== 'all') {
      result = result.filter(o => o.sales_person_id === salesPersonFilter);
    }
    if (startDate || endDate) {
      const s = startDate ? startOfDay(startDate) : null;
      const e = endDate ? endOfDay(endDate) : null;
      result = result.filter(o => {
        if (!o.created_at) return false;
        const d = parseISO(o.created_at);
        if (s && d < s) return false;
        if (e && d > e) return false;
        return true;
      });
    }
    return result;
  }, [orders, role, user, salesPersonFilter, startDate, endDate]);

  const analytics = useMemo(() => {
    const now = new Date();
    const pendingOrders = filteredOrders.filter(o => !['won', 'lost'].includes(o.status));
    
    // Total pipeline value (only pending orders)
    const totalPipelineValue = pendingOrders.reduce((sum, o) => sum + (o.expected_price || 0) * o.quantity, 0);
    
    // Won value
    const wonOrders = filteredOrders.filter(o => o.status === 'won');
    const wonValue = wonOrders.reduce((sum, o) => sum + (o.expected_price || 0) * o.quantity, 0);
    
    // Pipeline by sales person (only show for non-sales roles)
    const bySalesPerson: Record<string, { name: string; value: number; count: number }> = {};
    if (!isSalesView) {
      pendingOrders.forEach(o => {
        if (!bySalesPerson[o.sales_person_id]) {
          bySalesPerson[o.sales_person_id] = { name: o.sales_person_name, value: 0, count: 0 };
        }
        bySalesPerson[o.sales_person_id].value += (o.expected_price || 0) * o.quantity;
        bySalesPerson[o.sales_person_id].count++;
      });
    }
    const salesPersonData = Object.values(bySalesPerson).sort((a, b) => b.value - a.value);
    
    // Pipeline by status
    const byStatus: Record<string, { label: string; value: number; count: number }> = {};
    filteredOrders.forEach(o => {
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
    
    // Pipeline by category
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
    };
  }, [filteredOrders, isSalesView]);

  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${value.toFixed(0)}`;
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filters:
            </div>
            {!isSalesView && (
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Sales Person</Label>
                <Select value={salesPersonFilter} onValueChange={setSalesPersonFilter}>
                  <SelectTrigger className="w-[220px] h-9">
                    <SelectValue placeholder="All sales persons" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sales Persons</SelectItem>
                    {availableSalesPersons.map(sp => (
                      <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Created Date Range</Label>
              <DateRangeFilter
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
                onClear={() => { setStartDate(undefined); setEndDate(undefined); }}
              />
            </div>
            <div className="ml-auto text-sm text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{filteredOrders.length}</span> orders
            </div>
          </div>
        </CardContent>
      </Card>

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

      {/* Pipeline by Sales Person - only visible for non-sales roles */}
      {!isSalesView && (
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
      )}

      {/* Pipeline by Category */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Pipeline by Product Category
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.categoryData.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={formatCurrency} fontSize={12} />
                <YAxis dataKey="category" type="category" width={120} fontSize={11} />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), 'Pipeline Value']}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
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
                    <tr key={idx} className="border-b last:border-0">
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
