import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, LineChart, Line,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Users, Target, DollarSign, Package,
  Flame, Phone, MessageCircle, Mail, FileText, Send, ArrowRight,
  CheckCircle2, XCircle, Clock, ShoppingCart, Eye, Zap,
} from 'lucide-react';
import { useEnquiries } from '@/hooks/useEnquiries';
import { useInteraktLeads } from '@/hooks/useInteraktLeads';
import { useEmailLeads } from '@/hooks/useEmailLeads';
import { usePipelineOrders } from '@/hooks/usePipelineOrders';
import { useOrders } from '@/hooks/useOrders';
import { useProspects } from '@/hooks/useProspects';
import { useSalesTargets } from '@/hooks/useSalesTargets';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isAfter, isBefore, parseISO, isToday, startOfDay, endOfDay } from 'date-fns';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4'];

const formatCurrency = (value: number) => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value.toFixed(0)}`;
};

type TimeFilter = 'today' | 'this_week' | 'this_month' | 'last_month' | 'last_90' | 'all';

function getDateRange(filter: TimeFilter) {
  const now = new Date();
  switch (filter) {
    case 'today': return { start: startOfDay(now), end: endOfDay(now) };
    case 'this_week': return { start: startOfWeek(now), end: endOfWeek(now) };
    case 'this_month': return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last_month': {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    }
    case 'last_90': return { start: subDays(now, 90), end: now };
    case 'all': return { start: new Date(2020, 0, 1), end: now };
  }
}

function filterByDate<T extends { created_at: string }>(items: T[], range: { start: Date; end: Date }) {
  return items.filter(item => {
    const d = parseISO(item.created_at);
    return !isBefore(d, range.start) && !isAfter(d, range.end);
  });
}

export function SalesCommandCenter() {
  const { user, role } = useAuth();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('this_month');
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>('all');
  const isManager = role === 'admin' || role === 'supply_chain' || role === 'sales_manager';

  // Data hooks
  const { enquiries } = useEnquiries();
  const { leads: interaktLeads } = useInteraktLeads();
  const { leads: emailLeads } = useEmailLeads();
  const { pipelineOrders } = usePipelineOrders();
  const { orders } = useOrders();
  const { prospects } = useProspects();
  const { targets } = useSalesTargets();

  // Fetch call logs + form leads
  const { data: callLogs = [] } = useQuery({
    queryKey: ['command-center-call-logs'],
    queryFn: async () => {
      const { data } = await supabase.from('call_logs').select('*').order('created_at', { ascending: false });
      return data || [];
    },
  });

  const { data: formLeads = [] } = useQuery({
    queryKey: ['command-center-form-leads'],
    queryFn: async () => {
      const { data } = await supabase.from('form_leads').select('*').order('created_at', { ascending: false });
      return data || [];
    },
  });

  // Sales team
  const { data: salesTeam = [] } = useQuery({
    queryKey: ['sales-team-list'],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_sales_team');
      return data || [];
    },
  });

  const dateRange = getDateRange(timeFilter);

  // Apply time and salesperson filters
  const filtered = useMemo(() => {
    const applySpFilter = <T extends Record<string, any>>(items: T[], spField: string) => {
      let result = filterByDate(items as any[], dateRange) as T[];
      if (salesPersonFilter !== 'all') {
        result = result.filter(i => i[spField] === salesPersonFilter);
      } else if (!isManager) {
        result = result.filter(i => i[spField] === user?.id);
      }
      return result;
    };

    return {
      enquiries: applySpFilter(enquiries, 'sales_person_id'),
      interakt: applySpFilter(interaktLeads as any[], 'sales_person_id'),
      email: applySpFilter(emailLeads as any[], 'sales_person_id'),
      calls: filterByDate(callLogs as any[], dateRange),
      forms: filterByDate(formLeads as any[], dateRange),
      pipeline: applySpFilter(pipelineOrders, 'sales_person_id'),
      orders: applySpFilter(orders, 'sales_person_id'),
      prospects: (() => {
        let result = filterByDate(prospects as any[], dateRange);
        if (salesPersonFilter !== 'all') {
          result = result.filter((p: any) => p.created_by === salesPersonFilter);
        } else if (!isManager) {
          result = result.filter((p: any) => p.created_by === user?.id);
        }
        return result;
      })(),
    };
  }, [enquiries, interaktLeads, emailLeads, callLogs, formLeads, pipelineOrders, orders, prospects, dateRange, salesPersonFilter, isManager, user]);

  // ============ KPIs ============
  const totalLeadsAll = filtered.enquiries.length + filtered.interakt.length + filtered.email.length + filtered.calls.length + filtered.forms.length;
  const totalProspects = filtered.prospects.length;
  const activePipeline = filtered.pipeline.filter(p => p.status !== 'won' && p.status !== 'lost');
  const pipelineValue = activePipeline.reduce((s, p) => s + (p.expected_price || 0), 0);
  const ordersWon = filtered.orders.length;
  const ordersValue = filtered.orders.reduce((s, o) => s + (o.total_sales_amount || 0), 0);
  const enquiriesProcessed = filtered.enquiries.filter(e => e.status !== 'pending' && e.status !== 'on_hold').length;
  const conversionRate = totalLeadsAll > 0 ? ((ordersWon / totalLeadsAll) * 100).toFixed(1) : '0';

  // ============ Lead Source Breakdown ============
  const leadSourceData = [
    { name: 'Enquiries', value: filtered.enquiries.length, icon: Send, color: '#6366f1' },
    { name: 'Interakt', value: filtered.interakt.length, icon: MessageCircle, color: '#22c55e' },
    { name: 'MyOperator', value: filtered.calls.length, icon: Phone, color: '#f59e0b' },
    { name: 'Emails', value: filtered.email.length, icon: Mail, color: '#3b82f6' },
    { name: 'Forms', value: filtered.forms.length, icon: FileText, color: '#8b5cf6' },
  ];

  // ============ Salesperson Performance ============
  const salesPersonPerformance = useMemo(() => {
    if (!isManager) return [];
    
    const spMap = new Map<string, { name: string; leads: number; prospects: number; pipelineValue: number; ordersWon: number; revenue: number }>();

    // Initialize from sales team
    salesTeam.forEach((sp: any) => {
      spMap.set(sp.user_id, { name: sp.name, leads: 0, prospects: 0, pipelineValue: 0, ordersWon: 0, revenue: 0 });
    });

    // Count leads
    filtered.enquiries.forEach(e => {
      if (!e.sales_person_id) return;
      const sp = spMap.get(e.sales_person_id) || { name: e.sales_person_name || 'Unknown', leads: 0, prospects: 0, pipelineValue: 0, ordersWon: 0, revenue: 0 };
      sp.leads++;
      spMap.set(e.sales_person_id, sp);
    });

    // Count prospects
    filtered.prospects.forEach((p: any) => {
      if (!p.created_by) return;
      const sp = spMap.get(p.created_by);
      if (sp) sp.prospects++;
    });

    // Pipeline value
    filtered.pipeline.forEach(p => {
      if (!p.sales_person_id) return;
      const sp = spMap.get(p.sales_person_id);
      if (sp && p.status !== 'won' && p.status !== 'lost') sp.pipelineValue += p.expected_price || 0;
    });

    // Orders
    filtered.orders.forEach(o => {
      if (!o.sales_person_id) return;
      const sp = spMap.get(o.sales_person_id);
      if (sp) {
        sp.ordersWon++;
        sp.revenue += o.total_sales_amount || 0;
      }
    });

    return Array.from(spMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [isManager, salesTeam, filtered]);

  // ============ Target vs Achieved ============
  const targetComparison = useMemo(() => {
    const now = new Date();
    const currentTargets = targets.filter(t =>
      new Date(t.period_start) <= now && new Date(t.period_end) >= now
    );

    return currentTargets.map(t => {
      // Calculate actual achieved from orders
      const spOrders = orders.filter(o => o.sales_person_id === t.user_id);
      const spPipeline = pipelineOrders.filter(p => p.sales_person_id === t.user_id && p.status !== 'won' && p.status !== 'lost');
      const spProspects = prospects.filter((p: any) => p.created_by === t.user_id);
      const revenue = spOrders.reduce((s, o) => s + (o.total_sales_amount || 0), 0);
      const pipeVal = spPipeline.reduce((s, p) => s + (p.expected_price || 0), 0);

      return {
        name: t.user_name,
        revenueTarget: t.revenue_target,
        revenueAchieved: revenue,
        ordersTarget: t.orders_target,
        ordersAchieved: spOrders.length,
        pipelineTarget: t.pipeline_target,
        pipelineAchieved: pipeVal,
        prospectsCount: spProspects.length,
        revenuePct: t.revenue_target > 0 ? Math.round((revenue / t.revenue_target) * 100) : 0,
      };
    });
  }, [targets, orders, pipelineOrders, prospects]);

  // ============ Funnel Data ============
  const funnelData = [
    { stage: 'Total Leads', value: totalLeadsAll, color: '#6366f1' },
    { stage: 'Prospects', value: totalProspects, color: '#f59e0b' },
    { stage: 'Pipeline', value: activePipeline.length, color: '#3b82f6' },
    { stage: 'Orders Won', value: ordersWon, color: '#22c55e' },
  ];

  // Enquiry status distribution
  const enquiryStatusData = [
    { name: 'Pending', value: filtered.enquiries.filter(e => e.status === 'pending').length, color: '#f59e0b' },
    { name: 'Responded', value: filtered.enquiries.filter(e => e.status === 'responded').length, color: '#3b82f6' },
    { name: 'Pipeline', value: filtered.enquiries.filter(e => e.status === 'moved_to_pipeline').length, color: '#8b5cf6' },
    { name: 'Won', value: filtered.enquiries.filter(e => e.status === 'order_won').length, color: '#22c55e' },
    { name: 'Lost', value: filtered.enquiries.filter(e => e.status === 'order_lost').length, color: '#ef4444' },
    { name: 'On Hold', value: filtered.enquiries.filter(e => e.status === 'on_hold').length, color: '#6b7280' },
  ].filter(d => d.value > 0);

  // Pipeline status
  const pipelineStatusData = [
    { name: 'Pending', value: filtered.pipeline.filter(p => p.status === 'pending_confirmation').length, color: '#f59e0b' },
    { name: 'Negotiation', value: filtered.pipeline.filter(p => p.status === 'negotiation').length, color: '#3b82f6' },
    { name: 'Won', value: filtered.pipeline.filter(p => p.status === 'won').length, color: '#22c55e' },
    { name: 'Lost', value: filtered.pipeline.filter(p => p.status === 'lost').length, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // Daily trend for last 14 days
  const dailyTrend = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = subDays(new Date(), 13 - i);
      return format(d, 'yyyy-MM-dd');
    });

    return days.map(date => {
      const label = format(parseISO(date), 'MMM d');
      return {
        date: label,
        enquiries: enquiries.filter(e => e.created_at.startsWith(date)).length,
        prospects: (prospects as any[]).filter(p => p.created_at?.startsWith(date)).length,
        orders: orders.filter(o => o.created_at.startsWith(date)).length,
      };
    });
  }, [enquiries, prospects, orders]);

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    fontSize: '12px',
  };

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="last_90">Last 90 Days</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>

        {isManager && (
          <Select value={salesPersonFilter} onValueChange={setSalesPersonFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Salespersons" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Salespersons</SelectItem>
              {salesTeam.map((sp: any) => (
                <SelectItem key={sp.user_id} value={sp.user_id}>{sp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Badge variant="outline" className="ml-auto text-xs">
          {timeFilter === 'today' ? 'Today' : timeFilter === 'this_week' ? 'This Week' : timeFilter === 'this_month' ? 'This Month' : timeFilter === 'last_month' ? 'Last Month' : timeFilter === 'last_90' ? 'Last 90 Days' : 'All Time'}
        </Badge>
      </div>

      {/* ============ TOP KPI CARDS ============ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard label="Total Leads" value={totalLeadsAll} icon={Users} gradient="from-indigo-500 to-blue-600" />
        <KPICard label="Prospects" value={totalProspects} icon={Target} gradient="from-amber-500 to-orange-600" />
        <KPICard label="Active Pipeline" value={activePipeline.length} icon={TrendingUp} gradient="from-blue-500 to-cyan-600" subText={formatCurrency(pipelineValue)} />
        <KPICard label="Orders Won" value={ordersWon} icon={ShoppingCart} gradient="from-green-500 to-emerald-600" />
        <KPICard label="Revenue" value={formatCurrency(ordersValue)} icon={DollarSign} gradient="from-purple-500 to-violet-600" isText />
        <KPICard label="Conversion" value={`${conversionRate}%`} icon={Zap} gradient="from-rose-500 to-pink-600" isText />
      </div>

      {/* ============ ENQUIRIES RECEIVED vs ACHIEVED ============ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              Enquiries → Orders
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Received</span>
              <span className="text-xl font-bold">{filtered.enquiries.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Processed</span>
              <span className="text-xl font-bold text-blue-500">{enquiriesProcessed}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Converted</span>
              <span className="text-xl font-bold text-green-500">{filtered.enquiries.filter(e => e.status === 'order_won').length}</span>
            </div>
            <Progress
              value={filtered.enquiries.length > 0 ? (filtered.enquiries.filter(e => e.status === 'order_won').length / filtered.enquiries.length) * 100 : 0}
              className="h-2"
            />
            <p className="text-xs text-muted-foreground text-center">
              {filtered.enquiries.length > 0 ? ((filtered.enquiries.filter(e => e.status === 'order_won').length / filtered.enquiries.length) * 100).toFixed(1) : 0}% win rate
            </p>
          </CardContent>
        </Card>

        {/* Lead Source Distribution */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              Lead Sources Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-2">
              {leadSourceData.map(src => (
                <div key={src.name} className="text-center p-3 rounded-lg border border-border/50 hover:border-primary/30 transition-colors">
                  <src.icon className="w-5 h-5 mx-auto mb-1" style={{ color: src.color }} />
                  <p className="text-lg font-bold">{src.value}</p>
                  <p className="text-[10px] text-muted-foreground">{src.name}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ============ TARGET VS ACHIEVED (for managers) ============ */}
      {isManager && targetComparison.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Salesperson Target vs Achieved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Person</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Rev Target</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Rev Achieved</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">%</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Pipeline</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Prospects</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {targetComparison.map(t => (
                    <tr key={t.name} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="py-2 px-3 font-medium">{t.name}</td>
                      <td className="py-2 px-3 text-right">{formatCurrency(t.revenueTarget)}</td>
                      <td className="py-2 px-3 text-right font-semibold">{formatCurrency(t.revenueAchieved)}</td>
                      <td className="py-2 px-3 text-right">
                        <Badge variant={t.revenuePct >= 100 ? 'default' : t.revenuePct >= 70 ? 'secondary' : 'destructive'} className="text-xs">
                          {t.revenuePct}%
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground">{formatCurrency(t.pipelineAchieved)}</td>
                      <td className="py-2 px-3 text-right text-muted-foreground">{t.prospectsCount}</td>
                      <td className="py-2 px-3 text-right text-muted-foreground">{t.ordersAchieved}/{t.ordersTarget}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============ SALESPERSON PERFORMANCE BAR ============ */}
      {isManager && salesPersonPerformance.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Salesperson Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesPersonPerformance}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" tickFormatter={(v) => v.split(' ')[0]} />
                <YAxis className="text-xs" />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar dataKey="leads" fill="#6366f1" name="Leads" radius={[4, 4, 0, 0]} />
                <Bar dataKey="prospects" fill="#f59e0b" name="Prospects" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ordersWon" fill="#22c55e" name="Orders" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ============ SALES FUNNEL ============ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Sales Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {funnelData.map((stage, i) => {
                const maxVal = funnelData[0].value || 1;
                const pct = Math.max(10, (stage.value / maxVal) * 100);
                return (
                  <div key={stage.stage} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{stage.stage}</span>
                      <span className="font-bold">{stage.value}</span>
                    </div>
                    <div className="h-8 rounded-lg overflow-hidden bg-muted/30">
                      <div
                        className="h-full rounded-lg flex items-center justify-end pr-2 text-xs text-white font-semibold transition-all"
                        style={{ width: `${pct}%`, backgroundColor: stage.color }}
                      >
                        {i > 0 && funnelData[i - 1].value > 0 ? `${((stage.value / funnelData[i - 1].value) * 100).toFixed(0)}%` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ============ ENQUIRY STATUS PIE ============ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              Enquiry Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {enquiryStatusData.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={enquiryStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {enquiryStatusData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ============ PIPELINE STATUS PIE ============ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              Pipeline Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineStatusData.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pipelineStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {pipelineStatusData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ============ DAILY TREND ============ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              14-Day Activity Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Area type="monotone" dataKey="enquiries" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} name="Enquiries" />
                <Area type="monotone" dataKey="prospects" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} name="Prospects" />
                <Area type="monotone" dataKey="orders" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} name="Orders" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============ KPI Card Component ============
function KPICard({ label, value, icon: Icon, gradient, subText, isText }: {
  label: string; value: number | string; icon: any; gradient: string; subText?: string; isText?: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className={`p-4 bg-gradient-to-br ${gradient} text-white`}>
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-4 h-4 opacity-80" />
          <span className="text-[10px] uppercase tracking-wider opacity-80">{label}</span>
        </div>
        <p className="text-2xl font-bold">{isText ? value : typeof value === 'number' ? value.toLocaleString() : value}</p>
        {subText && <p className="text-xs opacity-80 mt-0.5">{subText}</p>}
      </CardContent>
    </Card>
  );
}
