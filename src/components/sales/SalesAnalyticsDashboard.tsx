import { useMemo, useState } from 'react';
import { LeadPerformanceCharts } from './LeadPerformanceCharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  Area,
  AreaChart,
} from 'recharts';
import {
  MapPin,
  Package,
  Calendar,
  TrendingUp,
  DollarSign,
  Target,
  Users,
  Flame,
  Building2,
  X,
} from 'lucide-react';
import { usePipelineOrders, PipelineOrder } from '@/hooks/usePipelineOrders';
import { useExpectedPayments, ExpectedPayment } from '@/hooks/useExpectedPayments';
import { useEnquiries, Enquiry } from '@/hooks/useEnquiries';
import { useAuth } from '@/hooks/useAuth';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, addMonths } from 'date-fns';
import { DailyActivityAnalytics } from './DailyActivityAnalytics';
import { LeadTemperatureBadge } from '@/components/LeadTemperatureBadge';

// Detail item type for the dialog
interface DetailItem {
  id: string;
  type: 'pipeline' | 'enquiry' | 'payment';
  customer_name: string;
  customer_company: string;
  product_name: string;
  value: number;
  date: string;
  status: string;
  temperature?: string;
}

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

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh',
];

export function SalesAnalyticsDashboard() {
  const { user, role } = useAuth();
  const { pipelineOrders, loading: pipelineLoading } = usePipelineOrders();
  const { payments, loading: paymentsLoading } = useExpectedPayments();
  const { enquiries, loading: enquiriesLoading } = useEnquiries();
  
  const isManager = ['admin', 'supply_chain', 'sales_manager', 'finance'].includes(role ?? '');

  // Dialog state for detail drill-down
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogItems, setDialogItems] = useState<DetailItem[]>([]);

  // Filter data based on role
  const filteredPipeline = useMemo(() => {
    if (isManager) return pipelineOrders;
    return pipelineOrders.filter(p => p.sales_person_id === user?.id);
  }, [pipelineOrders, isManager, user]);

  const filteredEnquiries = useMemo(() => {
    if (isManager) return enquiries;
    return enquiries.filter(e => e.sales_person_id === user?.id);
  }, [enquiries, isManager, user]);

  // Summary metrics
  const summaryMetrics = useMemo(() => {
    const activePipeline = filteredPipeline.filter(p => p.status !== 'won' && p.status !== 'lost');
    const totalPipelineValue = activePipeline.reduce((sum, p) => sum + (p.expected_price || 0), 0);
    const hotLeads = filteredEnquiries.filter(e => e.lead_temperature === 'hot').length;
    const megaDeals = filteredPipeline.filter(p => p.is_mega_deal).length;
    const avgDealSize = activePipeline.length > 0 
      ? totalPipelineValue / activePipeline.length 
      : 0;

    return {
      totalPipelineValue,
      activePipelineCount: activePipeline.length,
      hotLeads,
      megaDeals,
      avgDealSize,
    };
  }, [filteredPipeline, filteredEnquiries]);

  // Pipeline by State
  const pipelineByState = useMemo(() => {
    const stateMap = new Map<string, number>();
    
    filteredPipeline
      .filter(p => p.status !== 'won' && p.status !== 'lost')
      .forEach(p => {
        const state = (p as any).customer_state || 'Unknown';
        const current = stateMap.get(state) || 0;
        stateMap.set(state, current + (p.expected_price || 0));
      });

    return Array.from(stateMap.entries())
      .map(([state, value]) => ({ state, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredPipeline]);

  // Pipeline by Category
  const pipelineByCategory = useMemo(() => {
    const categoryMap = new Map<string, { value: number; count: number }>();
    
    filteredPipeline
      .filter(p => p.status !== 'won' && p.status !== 'lost')
      .forEach(p => {
        const category = p.product_category || 'Uncategorized';
        const current = categoryMap.get(category) || { value: 0, count: 0 };
        categoryMap.set(category, {
          value: current.value + (p.expected_price || 0),
          count: current.count + 1,
        });
      });

    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.value - a.value);
  }, [filteredPipeline]);

  // Pipeline by Salesperson (managers only — for individual reps it's just themselves)
  const pipelineBySalesperson = useMemo(() => {
    const map = new Map<string, { name: string; value: number; count: number }>();

    filteredPipeline
      .filter(p => p.status !== 'won' && p.status !== 'lost')
      .forEach(p => {
        const id = p.sales_person_id || 'unassigned';
        const name = p.sales_person_name || 'Unassigned';
        const current = map.get(id) || { name, value: 0, count: 0 };
        map.set(id, {
          name,
          value: current.value + (p.expected_price || 0),
          count: current.count + 1,
        });
      });

    return Array.from(map.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredPipeline]);

  // Pipeline by Lead Temperature
  const pipelineByTemperature = useMemo(() => {
    const tempMap = { hot: 0, warm: 0, cold: 0 };
    
    filteredPipeline
      .filter(p => p.status !== 'won' && p.status !== 'lost')
      .forEach(p => {
        const temp = p.lead_temperature || 'warm';
        tempMap[temp] += p.expected_price || 0;
      });

    return [
      { name: 'Hot', value: tempMap.hot, color: '#ef4444' },
      { name: 'Warm', value: tempMap.warm, color: '#f59e0b' },
      { name: 'Cold', value: tempMap.cold, color: '#3b82f6' },
    ].filter(t => t.value > 0);
  }, [filteredPipeline]);

  // Expected Payments Timeline (next 30 days)
  const paymentsTimeline = useMemo(() => {
    const now = new Date();
    const endDate = addMonths(now, 1);
    const days = eachDayOfInterval({ start: now, end: endDate });

    return days.map(day => {
      const dayPayments = payments.filter(p => {
        if (!p.expected_date || p.status === 'received') return false;
        const paymentDate = parseISO(p.expected_date);
        return isSameDay(paymentDate, day);
      });

      const pipelineClosures = filteredPipeline.filter(p => {
        if (!p.expected_closure_date || p.status === 'won' || p.status === 'lost') return false;
        const closureDate = parseISO(p.expected_closure_date);
        return isSameDay(closureDate, day);
      });

      return {
        date: format(day, 'MMM d'),
        payments: dayPayments.reduce((sum, p) => sum + p.amount, 0),
        pipeline: pipelineClosures.reduce((sum, p) => sum + (p.expected_price || 0), 0),
      };
    });
  }, [payments, filteredPipeline]);

  // Monthly pipeline trend
  const monthlyTrend = useMemo(() => {
    const months: { [key: string]: { created: number; won: number; lost: number } } = {};
    
    filteredPipeline.forEach(p => {
      const month = format(new Date(p.created_at), 'MMM yyyy');
      if (!months[month]) {
        months[month] = { created: 0, won: 0, lost: 0 };
      }
      months[month].created += p.expected_price || 0;
      
      if (p.status === 'won') {
        months[month].won += p.expected_price || 0;
      } else if (p.status === 'lost') {
        months[month].lost += p.expected_price || 0;
      }
    });

    return Object.entries(months)
      .slice(-6)
      .map(([month, data]) => ({
        month,
        ...data,
      }));
  }, [filteredPipeline]);

  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
    return `₹${value.toFixed(0)}`;
  };

  // Click handlers for drill-down
  const handleTemperatureClick = (temperature: string) => {
    const tempLower = temperature.toLowerCase();
    const items: DetailItem[] = filteredPipeline
      .filter(p => p.lead_temperature === tempLower && p.status !== 'won' && p.status !== 'lost')
      .map(p => ({
        id: p.id,
        type: 'pipeline' as const,
        customer_name: p.customer_name,
        customer_company: p.customer_company,
        product_name: p.product_name,
        value: p.expected_price || 0,
        date: p.created_at,
        status: p.status,
        temperature: p.lead_temperature,
      }));
    
    setDialogTitle(`${temperature} Leads (${items.length})`);
    setDialogItems(items);
    setDetailDialogOpen(true);
  };

  const handleInflowChartClick = (data: any) => {
    if (!data || !data.activePayload || data.activePayload.length === 0) return;
    
    const clickedDate = data.activeLabel;
    const now = new Date();
    const endDate = addMonths(now, 1);
    const days = eachDayOfInterval({ start: now, end: endDate });
    const targetDay = days.find(d => format(d, 'MMM d') === clickedDate);
    
    if (!targetDay) return;

    const dayPayments = payments.filter(p => {
      if (!p.expected_date || p.status === 'received') return false;
      const paymentDate = parseISO(p.expected_date);
      return isSameDay(paymentDate, targetDay);
    });

    const pipelineClosures = filteredPipeline.filter(p => {
      if (!p.expected_closure_date || p.status === 'won' || p.status === 'lost') return false;
      const closureDate = parseISO(p.expected_closure_date);
      return isSameDay(closureDate, targetDay);
    });

    const items: DetailItem[] = [
      ...dayPayments.map(p => ({
        id: p.id,
        type: 'payment' as const,
        customer_name: p.customer_name,
        customer_company: p.customer_company || '',
        product_name: p.order_number || 'Payment',
        value: p.amount,
        date: p.expected_date,
        status: p.status,
      })),
      ...pipelineClosures.map(p => ({
        id: p.id,
        type: 'pipeline' as const,
        customer_name: p.customer_name,
        customer_company: p.customer_company,
        product_name: p.product_name,
        value: p.expected_price || 0,
        date: p.expected_closure_date || '',
        status: p.status,
        temperature: p.lead_temperature,
      })),
    ];

    setDialogTitle(`Expected Inflows - ${clickedDate} (${items.length} items)`);
    setDialogItems(items);
    setDetailDialogOpen(true);
  };

  const handleCategoryClick = (category: string) => {
    const items: DetailItem[] = filteredPipeline
      .filter(p => p.product_category === category && p.status !== 'won' && p.status !== 'lost')
      .map(p => ({
        id: p.id,
        type: 'pipeline' as const,
        customer_name: p.customer_name,
        customer_company: p.customer_company,
        product_name: p.product_name,
        value: p.expected_price || 0,
        date: p.created_at,
        status: p.status,
        temperature: p.lead_temperature,
      }));
    
    setDialogTitle(`${category} Pipeline (${items.length})`);
    setDialogItems(items);
    setDetailDialogOpen(true);
  };

  const handleStateClick = (state: string) => {
    const items: DetailItem[] = filteredPipeline
      .filter(p => (p as any).customer_state === state && p.status !== 'won' && p.status !== 'lost')
      .map(p => ({
        id: p.id,
        type: 'pipeline' as const,
        customer_name: p.customer_name,
        customer_company: p.customer_company,
        product_name: p.product_name,
        value: p.expected_price || 0,
        date: p.created_at,
        status: p.status,
        temperature: p.lead_temperature,
      }));
    
    setDialogTitle(`${state} Pipeline (${items.length})`);
    setDialogItems(items);
    setDetailDialogOpen(true);
  };

  const handleSalespersonClick = (salesPersonId: string, salesPersonName: string) => {
    const items: DetailItem[] = filteredPipeline
      .filter(p => p.sales_person_id === salesPersonId && p.status !== 'won' && p.status !== 'lost')
      .map(p => ({
        id: p.id,
        type: 'pipeline' as const,
        customer_name: p.customer_name,
        customer_company: p.customer_company,
        product_name: p.product_name,
        value: p.expected_price || 0,
        date: p.created_at,
        status: p.status,
        temperature: p.lead_temperature,
      }));

    setDialogTitle(`${salesPersonName} Pipeline (${items.length})`);
    setDialogItems(items);
    setDetailDialogOpen(true);
  };

  const loading = pipelineLoading || paymentsLoading || enquiriesLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pipeline Value</p>
                <p className="text-2xl font-bold">{formatCurrency(summaryMetrics.totalPipelineValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Target className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Deals</p>
                <p className="text-2xl font-bold">{summaryMetrics.activePipelineCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <Flame className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hot Leads</p>
                <p className="text-2xl font-bold">{summaryMetrics.hotLeads}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <TrendingUp className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Deal Size</p>
                <p className="text-2xl font-bold">{formatCurrency(summaryMetrics.avgDealSize)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline by State */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPin className="w-5 h-5" />
              Pipeline by State
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineByState.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No state data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={pipelineByState} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    type="number" 
                    tickFormatter={formatCurrency}
                    className="text-xs"
                  />
                  <YAxis 
                    type="category" 
                    dataKey="state" 
                    width={100}
                    className="text-xs"
                  />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pipeline by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="w-5 h-5" />
              Pipeline by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineByCategory.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No category data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pipelineByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="category"
                    label={({ category, percent }) => 
                      `${category.slice(0, 12)}${category.length > 12 ? '...' : ''} (${(percent * 100).toFixed(0)}%)`
                    }
                    labelLine={false}
                  >
                    {pipelineByCategory.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
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

      {/* Pipeline by Salesperson */}
      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="w-5 h-5" />
              Pipeline by Salesperson
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineBySalesperson.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No salesperson data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(300, pipelineBySalesperson.length * 40)}>
                <BarChart data={pipelineBySalesperson} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    type="number"
                    tickFormatter={formatCurrency}
                    className="text-xs"
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    className="text-xs"
                  />
                  <Tooltip
                    formatter={(value: number, _name: string, props: any) => [
                      `${formatCurrency(value)} (${props?.payload?.count ?? 0} deals)`,
                      'Pipeline',
                    ]}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar
                    dataKey="value"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                    style={{ cursor: 'pointer' }}
                    onClick={(data: any) => handleSalespersonClick(data.id, data.name)}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead Temperature Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Flame className="w-5 h-5" />
              By Temperature
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineByTemperature.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                No data available
              </div>
            ) : (
              <div className="space-y-4">
                {pipelineByTemperature.map((temp) => (
                  <div 
                    key={temp.name} 
                    className="space-y-1 cursor-pointer hover:bg-muted/50 p-2 rounded-lg -m-2 transition-colors"
                    onClick={() => handleTemperatureClick(temp.name)}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: temp.color }}
                        />
                        <span>{temp.name}</span>
                      </div>
                      <span className="font-medium">{formatCurrency(temp.value)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all"
                        style={{ 
                          width: `${(temp.value / summaryMetrics.totalPipelineValue) * 100}%`,
                          backgroundColor: temp.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expected Payments Timeline */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="w-5 h-5" />
              Expected Inflows (Next 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={paymentsTimeline} onClick={handleInflowChartClick} style={{ cursor: 'pointer' }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  className="text-xs"
                  interval="preserveStartEnd"
                />
                <YAxis 
                  tickFormatter={formatCurrency}
                  className="text-xs"
                />
                <Tooltip 
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name === 'payments' ? 'Expected Payments' : 'Pipeline Closures'
                  ]}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="payments" 
                  stackId="1"
                  stroke="hsl(var(--primary))" 
                  fill="hsl(var(--primary))"
                  fillOpacity={0.6}
                />
                <Area 
                  type="monotone" 
                  dataKey="pipeline" 
                  stackId="1"
                  stroke="hsl(var(--chart-2))" 
                  fill="hsl(var(--chart-2))"
                  fillOpacity={0.4}
                />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="w-5 h-5" />
            Monthly Pipeline Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyTrend.length === 0 ? (
            <div className="flex items-center justify-center h-[250px] text-muted-foreground">
              No trend data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis tickFormatter={formatCurrency} className="text-xs" />
                <Tooltip 
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name === 'created' ? 'Created' : name === 'won' ? 'Won' : 'Lost'
                  ]}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Bar dataKey="created" name="Created" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="won" name="Won" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lost" name="Lost" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top Categories Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="w-5 h-5" />
            Category Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {pipelineByCategory.slice(0, 8).map((cat, index) => (
              <div 
                key={cat.category}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
                onClick={() => handleCategoryClick(cat.category)}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-2 h-8 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <div>
                    <p className="font-medium">{cat.category}</p>
                    <p className="text-sm text-muted-foreground">{cat.count} deals</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(cat.value)}</p>
                  <p className="text-sm text-muted-foreground">
                    Avg: {formatCurrency(cat.value / cat.count)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Lead Performance Charts */}
      <LeadPerformanceCharts 
        enquiries={filteredEnquiries} 
        pipelineOrders={filteredPipeline} 
      />

      {/* Daily Activity Analytics for Managers */}
      <DailyActivityAnalytics />

      {/* Detail Drill-Down Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogTitle}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            {dialogItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No items found for this selection
              </div>
            ) : (
              <div className="space-y-3">
                {dialogItems.map((item) => (
                  <div 
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">{item.customer_name}</span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {item.type === 'payment' ? 'Payment' : 'Pipeline'}
                        </Badge>
                        {item.temperature && (
                          <LeadTemperatureBadge 
                            temperature={item.temperature as any} 
                            showLabel={false}
                            size="sm"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Building2 className="w-3 h-3" />
                        <span className="truncate">{item.customer_company}</span>
                        <span>•</span>
                        <span className="truncate">{item.product_name}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-semibold text-primary">{formatCurrency(item.value)}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.date ? format(new Date(item.date), 'dd MMM yyyy') : '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
