import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import {
  TrendingUp, Users, Target, DollarSign, Package,
  Phone, MessageCircle, Mail, FileText, Send, ShoppingCart,
  Eye, Zap, Clock, CalendarIcon, ArrowUpRight, ArrowDownRight,
  Percent, Activity, Layers, BarChart3, Award, MapPin, Flame,
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
import {
  format, subDays, subWeeks, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  isAfter, isBefore, parseISO, startOfDay, endOfDay, eachDayOfInterval, addMonths, isSameDay,
} from 'date-fns';
import { useExpectedPayments } from '@/hooks/useExpectedPayments';
import type { DateRange } from 'react-day-picker';

const formatCurrency = (value: number) => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value.toFixed(0)}`;
};

type TimeFilter = 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'last_90' | 'all' | 'custom';

function getDateRange(filter: TimeFilter, customRange?: { from?: Date; to?: Date }) {
  const now = new Date();
  switch (filter) {
    case 'today': return { start: startOfDay(now), end: endOfDay(now) };
    case 'this_week': return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'last_week': {
      const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      return { start: lastWeekStart, end: endOfWeek(lastWeekStart, { weekStartsOn: 1 }) };
    }
    case 'this_month': return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last_month': {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: startOfMonth(lm), end: endOfMonth(lm) };
    }
    case 'last_90': return { start: subDays(now, 90), end: now };
    case 'custom': {
      if (customRange?.from) {
        return {
          start: startOfDay(customRange.from),
          end: customRange.to ? endOfDay(customRange.to) : endOfDay(customRange.from),
        };
      }
      return { start: startOfMonth(now), end: endOfMonth(now) };
    }
    case 'all': return { start: new Date(2020, 0, 1), end: now };
  }
}

function isInRange(dateStr: string | null | undefined, range: { start: Date; end: Date }): boolean {
  if (!dateStr) return false;
  try {
    const d = parseISO(dateStr);
    return !isBefore(d, range.start) && !isAfter(d, range.end);
  } catch {
    return false;
  }
}

const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: '12px',
};

const TIME_LABELS: Record<TimeFilter, string> = {
  today: 'Today',
  this_week: 'This Week',
  last_week: 'Last Week',
  this_month: 'This Month',
  last_month: 'Last Month',
  last_90: 'Last 90 Days',
  all: 'All Time',
  custom: 'Custom Range',
};

export function SalesCommandCenter() {
  const { user, role } = useAuth();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('this_month');
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>('all');
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
  const isManager = role === 'admin' || role === 'supply_chain' || role === 'sales_manager';

  // Data hooks — fetch ALL data, filter client-side
  const { enquiries } = useEnquiries();
  const { leads: interaktLeads } = useInteraktLeads();
  const { leads: emailLeads } = useEmailLeads();
  const { pipelineOrders } = usePipelineOrders();
  const { orders } = useOrders();
  const { prospects } = useProspects();
  const { targets } = useSalesTargets();
  const { payments } = useExpectedPayments();

  const { data: callLogs = [] } = useQuery({
    queryKey: ['command-center-call-logs'],
    queryFn: async () => {
      const { data } = await supabase.from('call_logs').select('*').order('created_at', { ascending: false }).limit(1000);
      return data || [];
    },
  });

  const { data: formLeads = [] } = useQuery({
    queryKey: ['command-center-form-leads'],
    queryFn: async () => {
      const { data } = await supabase.from('form_leads').select('*').order('created_at', { ascending: false }).limit(1000);
      return data || [];
    },
  });

  const { data: salesTeam = [] } = useQuery({
    queryKey: ['sales-team-list'],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_sales_team');
      return data || [];
    },
  });

  const dateRange = getDateRange(timeFilter, customDateRange);

  // ============ FILTERED DATA ============
  // Use a more robust approach: don't filter by salesperson for sources that don't have sales_person_id
  const filtered = useMemo(() => {
    const byDate = <T extends Record<string, any>>(items: T[], dateField = 'created_at') =>
      timeFilter === 'all' ? items : items.filter(i => isInRange(i[dateField], dateRange));

    const bySp = <T extends Record<string, any>>(items: T[], spField: string) => {
      if (salesPersonFilter !== 'all') return items.filter(i => i[spField] === salesPersonFilter);
      if (!isManager && user?.id) return items.filter(i => i[spField] === user.id);
      return items;
    };

    const fEnquiries = bySp(byDate(enquiries), 'sales_person_id');
    const fInterakt = byDate(interaktLeads as any[]);
    const fEmail = byDate(emailLeads as any[]);
    const fCalls = byDate(callLogs as any[]);
    const fForms = byDate(formLeads as any[]);
    const fPipeline = bySp(byDate(pipelineOrders), 'sales_person_id');
    const fOrders = bySp(byDate(orders), 'sales_person_id');
    const fProspects = (() => {
      let result = byDate(prospects as any[]);
      if (salesPersonFilter !== 'all') {
        result = result.filter((p: any) => p.created_by === salesPersonFilter);
      } else if (!isManager && user?.id) {
        result = result.filter((p: any) => p.created_by === user.id);
      }
      return result;
    })();

    return { enquiries: fEnquiries, interakt: fInterakt, email: fEmail, calls: fCalls, forms: fForms, pipeline: fPipeline, orders: fOrders, prospects: fProspects };
  }, [enquiries, interaktLeads, emailLeads, callLogs, formLeads, pipelineOrders, orders, prospects, dateRange, timeFilter, salesPersonFilter, isManager, user]);

  // ============ KPIs ============
  const totalLeadsAll = filtered.enquiries.length + filtered.interakt.length + filtered.email.length + filtered.calls.length + filtered.forms.length;
  const totalProspects = filtered.prospects.length;
  const aCategory = filtered.prospects.filter((p: any) => p.is_a_category).length;
  const activePipeline = filtered.pipeline.filter(p => p.status !== 'won' && p.status !== 'lost');
  const pipelineValue = activePipeline.reduce((s, p) => s + (p.expected_price || 0), 0);
  const pipelineWon = filtered.pipeline.filter(p => p.status === 'won');
  const pipelineWonValue = pipelineWon.reduce((s, p) => s + (p.expected_price || 0), 0);
  const pipelineLost = filtered.pipeline.filter(p => p.status === 'lost');
  const ordersWon = filtered.orders.length;
  const ordersValue = filtered.orders.reduce((s, o) => s + (o.total_sales_amount || 0), 0);
  const enquiriesWon = filtered.enquiries.filter(e => e.status === 'order_won').length;
  const enquiriesProcessed = filtered.enquiries.filter(e => e.status !== 'pending' && e.status !== 'on_hold').length;
  const responseRate = filtered.enquiries.length > 0 ? ((enquiriesProcessed / filtered.enquiries.length) * 100).toFixed(1) : '0';
  const winRate = filtered.enquiries.length > 0 ? ((enquiriesWon / filtered.enquiries.length) * 100).toFixed(1) : '0';
  const avgDealSize = ordersWon > 0 ? ordersValue / ordersWon : 0;
  const hotLeads = filtered.enquiries.filter((e: any) => e.lead_temperature === 'hot').length;

  // ============ Lead Source Breakdown ============
  const leadSourceData = [
    { name: 'Enquiries', value: filtered.enquiries.length, icon: Send, color: 'hsl(var(--chart-1))' },
    { name: 'Interakt', value: filtered.interakt.length, icon: MessageCircle, color: 'hsl(var(--chart-2))' },
    { name: 'MyOperator', value: filtered.calls.length, icon: Phone, color: 'hsl(var(--chart-3))' },
    { name: 'Emails', value: filtered.email.length, icon: Mail, color: 'hsl(var(--chart-4))' },
    { name: 'Forms', value: filtered.forms.length, icon: FileText, color: 'hsl(var(--chart-5))' },
  ];

  // ============ Salesperson Performance ============
  const salesPersonPerformance = useMemo(() => {
    if (!isManager || salesTeam.length === 0) return [];

    const spMap = new Map<string, { name: string; leads: number; prospects: number; pipelineValue: number; ordersWon: number; revenue: number }>();

    salesTeam.forEach((sp: any) => {
      spMap.set(sp.user_id, { name: sp.name, leads: 0, prospects: 0, pipelineValue: 0, ordersWon: 0, revenue: 0 });
    });

    filtered.enquiries.forEach((e: any) => {
      if (!e.sales_person_id) return;
      const sp = spMap.get(e.sales_person_id);
      if (sp) sp.leads++;
    });

    filtered.prospects.forEach((p: any) => {
      if (!p.created_by) return;
      const sp = spMap.get(p.created_by);
      if (sp) sp.prospects++;
    });

    filtered.pipeline.forEach(p => {
      if (!p.sales_person_id) return;
      const sp = spMap.get(p.sales_person_id);
      if (sp && p.status !== 'won' && p.status !== 'lost') sp.pipelineValue += p.expected_price || 0;
    });

    filtered.orders.forEach(o => {
      if (!o.sales_person_id) return;
      const sp = spMap.get(o.sales_person_id);
      if (sp) { sp.ordersWon++; sp.revenue += o.total_sales_amount || 0; }
    });

    return Array.from(spMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .filter(sp => sp.leads > 0 || sp.prospects > 0 || sp.ordersWon > 0 || sp.pipelineValue > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [isManager, salesTeam, filtered]);

  // ============ Target vs Achieved ============
  const targetComparison = useMemo(() => {
    const now = new Date();
    const currentTargets = targets.filter(t =>
      new Date(t.period_start) <= now && new Date(t.period_end) >= now
    );

    return currentTargets.map(t => {
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

  // ============ Funnel ============
  const funnelData = [
    { stage: 'Total Leads', value: totalLeadsAll, color: 'hsl(var(--chart-1))' },
    { stage: 'Prospects', value: totalProspects, color: 'hsl(var(--chart-3))' },
    { stage: 'Pipeline', value: activePipeline.length, color: 'hsl(var(--chart-4))' },
    { stage: 'Orders Won', value: ordersWon, color: 'hsl(var(--chart-2))' },
  ];

  // Enquiry status
  const enquiryStatusData = [
    { name: 'Pending', value: filtered.enquiries.filter((e: any) => e.status === 'pending').length, color: '#f59e0b' },
    { name: 'Responded', value: filtered.enquiries.filter((e: any) => e.status === 'responded').length, color: '#3b82f6' },
    { name: 'Pipeline', value: filtered.enquiries.filter((e: any) => e.status === 'moved_to_pipeline').length, color: '#8b5cf6' },
    { name: 'Won', value: filtered.enquiries.filter((e: any) => e.status === 'order_won').length, color: '#22c55e' },
    { name: 'Lost', value: filtered.enquiries.filter((e: any) => e.status === 'order_lost').length, color: '#ef4444' },
    { name: 'On Hold', value: filtered.enquiries.filter((e: any) => e.status === 'on_hold').length, color: '#6b7280' },
  ].filter(d => d.value > 0);

  // Pipeline status
  const pipelineStatusData = [
    { name: 'Pending', value: filtered.pipeline.filter(p => p.status === 'pending_confirmation').length, color: '#f59e0b' },
    { name: 'Negotiation', value: filtered.pipeline.filter(p => p.status === 'negotiation').length, color: '#3b82f6' },
    { name: 'Won', value: pipelineWon.length, color: '#22c55e' },
    { name: 'Lost', value: pipelineLost.length, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // Pipeline by category
  const pipelineByCategoryData = useMemo(() => {
    const catMap = new Map<string, number>();
    activePipeline.forEach(p => {
      const cat = p.product_category || 'Uncategorized';
      catMap.set(cat, (catMap.get(cat) || 0) + (p.expected_price || 0));
    });
    return Array.from(catMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [activePipeline]);

  // Prospect by source
  const prospectsBySource = useMemo(() => {
    const srcMap = new Map<string, number>();
    filtered.prospects.forEach((p: any) => {
      const src = p.source_type || 'unknown';
      srcMap.set(src, (srcMap.get(src) || 0) + 1);
    });
    return Array.from(srcMap.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered.prospects]);

  // 14-Day trend
  const dailyTrend = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => format(subDays(new Date(), 13 - i), 'yyyy-MM-dd'));
    return days.map(date => ({
      date: format(parseISO(date), 'MMM d'),
      enquiries: enquiries.filter(e => e.created_at?.startsWith(date)).length,
      interakt: (interaktLeads as any[]).filter(l => l.created_at?.startsWith(date)).length,
      calls: (callLogs as any[]).filter(c => c.created_at?.startsWith(date)).length,
      prospects: (prospects as any[]).filter(p => p.created_at?.startsWith(date)).length,
      orders: orders.filter(o => o.created_at?.startsWith(date)).length,
    }));
  }, [enquiries, interaktLeads, callLogs, prospects, orders]);

  // MyOperator call stats
  const callStats = useMemo(() => {
    const answered = filtered.calls.filter((c: any) => {
      const payload = c.raw_payload;
      if (!payload?._ld || !Array.isArray(payload._ld)) return c.call_status === 'answered';
      return (payload._ld as any[]).some((l: any) => l._ac === 'received');
    }).length;
    return { total: filtered.calls.length, answered, missed: filtered.calls.length - answered };
  }, [filtered.calls]);

  // ============ Pipeline by State ============
  const pipelineByState = useMemo(() => {
    const stateMap = new Map<string, number>();
    activePipeline.forEach(p => {
      const state = (p as any).customer_state || 'Unknown';
      stateMap.set(state, (stateMap.get(state) || 0) + (p.expected_price || 0));
    });
    return Array.from(stateMap.entries())
      .map(([state, value]) => ({ state, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [activePipeline]);

  // ============ Pipeline by Temperature ============
  const pipelineByTemperature = useMemo(() => {
    const tempMap: Record<string, number> = { hot: 0, warm: 0, cold: 0 };
    activePipeline.forEach(p => {
      const temp = p.lead_temperature || 'warm';
      tempMap[temp] = (tempMap[temp] || 0) + (p.expected_price || 0);
    });
    return [
      { name: 'Hot', value: tempMap.hot, color: '#ef4444' },
      { name: 'Warm', value: tempMap.warm, color: '#f59e0b' },
      { name: 'Cold', value: tempMap.cold, color: '#3b82f6' },
    ].filter(t => t.value > 0);
  }, [activePipeline]);

  // ============ Expected Payments Timeline (30 days) ============
  const paymentsTimeline = useMemo(() => {
    const now = new Date();
    const endDate = addMonths(now, 1);
    const days = eachDayOfInterval({ start: now, end: endDate });
    return days.map(day => {
      const dayPayments = payments.filter(p => {
        if (!p.expected_date || p.status === 'received') return false;
        return isSameDay(parseISO(p.expected_date), day);
      });
      const pipelineClosures = activePipeline.filter(p => {
        if (!p.expected_closure_date) return false;
        return isSameDay(parseISO(p.expected_closure_date), day);
      });
      return {
        date: format(day, 'MMM d'),
        payments: dayPayments.reduce((sum, p) => sum + p.amount, 0),
        closures: pipelineClosures.reduce((sum, p) => sum + (p.expected_price || 0), 0),
      };
    }).filter(d => d.payments > 0 || d.closures > 0);
  }, [payments, activePipeline]);

  return (
    <div className="space-y-6">
      {/* ============ FILTERS BAR ============ */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
          <SelectTrigger className="w-[160px]">
            <CalendarIcon className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="last_week">Last Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="last_90">Last 90 Days</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>

        {timeFilter === 'custom' && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarIcon className="w-4 h-4" />
                {customDateRange?.from
                  ? `${format(customDateRange.from, 'MMM d')}${customDateRange.to ? ` - ${format(customDateRange.to, 'MMM d')}` : ''}`
                  : 'Pick dates'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={customDateRange}
                onSelect={setCustomDateRange}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        )}

        {isManager && (
          <Select value={salesPersonFilter} onValueChange={setSalesPersonFilter}>
            <SelectTrigger className="w-[180px]">
              <Users className="w-4 h-4 mr-2 text-muted-foreground" />
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

        <Badge variant="outline" className="ml-auto text-xs gap-1">
          <Activity className="w-3 h-3" />
          {TIME_LABELS[timeFilter]}
        </Badge>
      </div>

      {/* ============ TOP KPI CARDS ============ */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KPICard label="Total Leads" value={totalLeadsAll} icon={Users} gradient="from-indigo-500 to-blue-600" />
        <KPICard label="Prospects" value={totalProspects} icon={Target} gradient="from-amber-500 to-orange-600" />
        <KPICard label="A-Category" value={aCategory} icon={Award} gradient="from-rose-500 to-pink-600" />
        <KPICard label="Hot Leads" value={hotLeads} icon={Zap} gradient="from-red-500 to-orange-600" />
        <KPICard label="Active Pipeline" value={activePipeline.length} icon={TrendingUp} gradient="from-blue-500 to-cyan-600" subText={formatCurrency(pipelineValue)} />
        <KPICard label="Orders Won" value={ordersWon} icon={ShoppingCart} gradient="from-green-500 to-emerald-600" subText={formatCurrency(ordersValue)} />
        <KPICard label="Avg Deal" value={formatCurrency(avgDealSize)} icon={DollarSign} gradient="from-purple-500 to-violet-600" isText />
        <KPICard label="Win Rate" value={`${winRate}%`} icon={Percent} gradient="from-teal-500 to-emerald-600" isText />
      </div>

      {/* ============ ENQUIRIES RECEIVED vs ACHIEVED + LEAD SOURCES ============ */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Enquiries → Orders funnel card */}
        <Card className="md:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              Enquiries Received vs Achieved
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <MetricRow label="Received" value={filtered.enquiries.length} />
            <MetricRow label="Processed" value={enquiriesProcessed} color="text-blue-500" />
            <MetricRow label="To Pipeline" value={filtered.enquiries.filter((e: any) => e.status === 'moved_to_pipeline').length} color="text-purple-500" />
            <MetricRow label="Won" value={enquiriesWon} color="text-green-500" />
            <MetricRow label="Lost" value={filtered.enquiries.filter((e: any) => e.status === 'order_lost').length} color="text-destructive" />
            <div className="pt-2 space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Response Rate</span>
                <span className="font-semibold text-foreground">{responseRate}%</span>
              </div>
              <Progress value={Number(responseRate)} className="h-1.5" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Win Rate</span>
                <span className="font-semibold text-foreground">{winRate}%</span>
              </div>
              <Progress value={Number(winRate)} className="h-1.5" />
            </div>
          </CardContent>
        </Card>

        {/* Lead Source Distribution */}
        <Card className="md:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              Lead Sources ({totalLeadsAll})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {leadSourceData.map(src => {
              const pct = totalLeadsAll > 0 ? ((src.value / totalLeadsAll) * 100) : 0;
              return (
                <div key={src.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <src.icon className="w-4 h-4" style={{ color: src.color }} />
                      <span>{src.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{src.value}</span>
                      <span className="text-xs text-muted-foreground">({pct.toFixed(0)}%)</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%`, backgroundColor: src.color }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Call Stats + Pipeline Summary */}
        <Card className="md:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Quick Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Calls Total" value={callStats.total} icon={Phone} />
              <MiniStat label="Calls Answered" value={callStats.answered} icon={Phone} positive />
              <MiniStat label="Calls Missed" value={callStats.missed} icon={Phone} negative />
              <MiniStat label="Pipeline Won" value={pipelineWon.length} icon={ShoppingCart} positive />
              <MiniStat label="Won Value" value={formatCurrency(pipelineWonValue)} icon={DollarSign} positive isText />
              <MiniStat label="Pipeline Lost" value={pipelineLost.length} icon={TrendingUp} negative />
            </div>
            {prospectsBySource.length > 0 && (
              <div className="pt-2 border-t border-border/30">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Prospects by Source</p>
                <div className="flex flex-wrap gap-1.5">
                  {prospectsBySource.map(ps => (
                    <Badge key={ps.name} variant="secondary" className="text-xs">
                      {ps.name}: {ps.value}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============ TARGET VS ACHIEVED ============ */}
      {isManager && targetComparison.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Salesperson Target vs Achieved (Current Period)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Person</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Rev Target</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Achieved</th>
                    <th className="text-center py-2 px-3 font-medium text-muted-foreground">Progress</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Pipeline</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Prospects</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {targetComparison.map(t => (
                    <tr key={t.name} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="py-2.5 px-3 font-medium">{t.name}</td>
                      <td className="py-2.5 px-3 text-right">{formatCurrency(t.revenueTarget)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold">{formatCurrency(t.revenueAchieved)}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(100, t.revenuePct)} className="h-2 flex-1" />
                          <Badge variant={t.revenuePct >= 100 ? 'default' : t.revenuePct >= 70 ? 'secondary' : 'destructive'} className="text-xs min-w-[40px] justify-center">
                            {t.revenuePct}%
                          </Badge>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">{formatCurrency(t.pipelineAchieved)}</td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">{t.prospectsCount}</td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">{t.ordersAchieved}/{t.ordersTarget}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============ SALESPERSON PERFORMANCE ============ */}
      {isManager && salesPersonPerformance.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Salesperson Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesPersonPerformance}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" tickFormatter={(v) => v.split(' ')[0]} />
                <YAxis className="text-xs" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => name === 'pipelineValue' ? formatCurrency(v) : v} />
                <Legend />
                <Bar dataKey="leads" fill="hsl(var(--chart-1))" name="Leads" radius={[4, 4, 0, 0]} />
                <Bar dataKey="prospects" fill="hsl(var(--chart-3))" name="Prospects" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ordersWon" fill="hsl(var(--chart-2))" name="Orders" radius={[4, 4, 0, 0]} />
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
                const pct = Math.max(8, (stage.value / maxVal) * 100);
                const convPct = i > 0 && funnelData[i - 1].value > 0 ? ((stage.value / funnelData[i - 1].value) * 100).toFixed(0) : null;
                return (
                  <div key={stage.stage} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{stage.stage}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{stage.value}</span>
                        {convPct && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {convPct}% conv
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="h-8 rounded-lg overflow-hidden bg-muted/30">
                      <div
                        className="h-full rounded-lg flex items-center justify-end pr-2 text-xs text-white font-semibold transition-all"
                        style={{ width: `${pct}%`, backgroundColor: stage.color }}
                      />
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
              Enquiry Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {enquiryStatusData.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">No enquiry data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={enquiryStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {enquiryStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ============ PIPELINE STATUS ============ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Pipeline Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineStatusData.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">No pipeline data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pipelineStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {pipelineStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ============ PIPELINE BY CATEGORY ============ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              Pipeline by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineByCategoryData.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">No category data</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={pipelineByCategoryData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={formatCurrency} className="text-xs" />
                  <YAxis type="category" dataKey="name" width={100} className="text-xs" tickFormatter={(v) => v.length > 14 ? v.slice(0, 14) + '…' : v} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Value" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============ PIPELINE BY STATE + TEMPERATURE ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Pipeline by State
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineByState.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">No state data</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={pipelineByState} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={formatCurrency} className="text-xs" />
                  <YAxis type="category" dataKey="state" width={100} className="text-xs" />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Pipeline Value" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Flame className="w-4 h-4 text-primary" />
              Pipeline by Temperature
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineByTemperature.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">No temperature data</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={pipelineByTemperature} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {pipelineByTemperature.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============ EXPECTED INFLOWS TIMELINE ============ */}
      {paymentsTimeline.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-primary" />
              Expected Inflows (Next 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={paymentsTimeline}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis tickFormatter={formatCurrency} className="text-xs" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [formatCurrency(v), name === 'payments' ? 'Payments' : 'Pipeline Closures']} />
                <Legend />
                <Bar dataKey="payments" fill="hsl(var(--chart-2))" name="Payments" radius={[4, 4, 0, 0]} />
                <Bar dataKey="closures" fill="hsl(var(--chart-4))" name="Pipeline Closures" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ============ DAILY TREND ============ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            14-Day Activity Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Area type="monotone" dataKey="enquiries" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.1} name="Enquiries" />
              <Area type="monotone" dataKey="interakt" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.1} name="Interakt" />
              <Area type="monotone" dataKey="calls" stroke="hsl(var(--chart-3))" fill="hsl(var(--chart-3))" fillOpacity={0.1} name="Calls" />
              <Area type="monotone" dataKey="prospects" stroke="hsl(var(--chart-4))" fill="hsl(var(--chart-4))" fillOpacity={0.1} name="Prospects" />
              <Area type="monotone" dataKey="orders" stroke="hsl(var(--chart-5))" fill="hsl(var(--chart-5))" fillOpacity={0.1} name="Orders" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ Sub-components ============

function KPICard({ label, value, icon: Icon, gradient, subText, isText }: {
  label: string; value: number | string; icon: any; gradient: string; subText?: string; isText?: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className={`p-3 bg-gradient-to-br ${gradient} text-white`}>
        <div className="flex items-center gap-1.5 mb-1">
          <Icon className="w-3.5 h-3.5 opacity-80" />
          <span className="text-[9px] uppercase tracking-wider opacity-80 leading-none">{label}</span>
        </div>
        <p className="text-xl font-bold leading-tight">{isText ? value : typeof value === 'number' ? value.toLocaleString() : value}</p>
        {subText && <p className="text-[10px] opacity-80 mt-0.5">{subText}</p>}
      </CardContent>
    </Card>
  );
}

function MetricRow({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-lg font-bold ${color || ''}`}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value, icon: Icon, positive, negative, isText }: {
  label: string; value: number | string; icon: any; positive?: boolean; negative?: boolean; isText?: boolean;
}) {
  return (
    <div className="p-2 rounded-lg border border-border/40 text-center">
      <Icon className={`w-3.5 h-3.5 mx-auto mb-0.5 ${positive ? 'text-green-500' : negative ? 'text-destructive' : 'text-muted-foreground'}`} />
      <p className={`text-sm font-bold ${positive ? 'text-green-500' : negative ? 'text-destructive' : ''}`}>
        {isText ? value : typeof value === 'number' ? value : value}
      </p>
      <p className="text-[9px] text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}
