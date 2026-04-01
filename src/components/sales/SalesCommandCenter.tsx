import { useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import {
  TrendingUp, Users, Target, DollarSign, Package,
  Phone, MessageCircle, Mail, FileText, Send, ShoppingCart,
  Eye, Zap, Clock, CalendarIcon, ArrowRight,
  Percent, Activity, Layers, BarChart3, Award, MapPin, Flame,
  Building2, ExternalLink, Lightbulb, Sparkles, AlertTriangle, ThumbsUp, ArrowUpRight,
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
import { useFollowups } from '@/hooks/useFollowups';
import { useCallbacks } from '@/hooks/useCallbacks';
import { LeadTemperatureBadge } from '@/components/LeadTemperatureBadge';
import { SalesPersonDeepDive } from '@/components/sales/SalesPersonDeepDive';
import type { DateRange } from 'react-day-picker';

const formatCurrency = (value: number) => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value.toFixed(0)}`;
};

type TimeFilter = 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'last_90' | 'all' | 'custom';

interface DetailItem {
  id: string;
  type: 'pipeline' | 'enquiry' | 'payment' | 'prospect' | 'lead';
  customer_name: string;
  customer_company: string;
  product_name: string;
  value: number;
  date: string;
  status: string;
  temperature?: string;
  tab?: string; // Which tab to navigate to
}

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

interface Suggestion {
  type: 'strength' | 'warning' | 'action' | 'insight';
  text: string;
}

function generatePerformanceSuggestions(
  sp: { id: string; name: string; leads: number; prospects: number; pipelineValue: number; ordersWon: number; revenue: number },
  allSp: typeof sp[],
  targets: { name: string; fullName?: string; revenuePct: number; revenueTarget: number; revenueAchieved: number; ordersTarget: number; ordersAchieved: number; pipelineAchieved: number; pipelinePct?: number }[]
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const firstName = sp.name.split(' ')[0];

  // Team averages
  const avgLeads = allSp.reduce((s, p) => s + p.leads, 0) / Math.max(allSp.length, 1);
  const avgProspects = allSp.reduce((s, p) => s + p.prospects, 0) / Math.max(allSp.length, 1);
  const avgOrders = allSp.reduce((s, p) => s + p.ordersWon, 0) / Math.max(allSp.length, 1);
  const avgRevenue = allSp.reduce((s, p) => s + p.revenue, 0) / Math.max(allSp.length, 1);

  // Lead-to-prospect conversion
  const conversionRate = sp.leads > 0 ? (sp.prospects / sp.leads) * 100 : 0;
  const prospectToPipeline = sp.prospects > 0 ? (sp.pipelineValue > 0 ? 'active' : 'none') : 'na';

  // Target comparison — match by first name or full name
  const target = targets.find(t => t.name === sp.name.split(' ')[0] || t.fullName === sp.name);

  // Strengths
  if (sp.revenue > avgRevenue * 1.3 && sp.revenue > 0) {
    suggestions.push({ type: 'strength', text: `${firstName} is a top performer — revenue ${Math.round((sp.revenue / avgRevenue - 1) * 100)}% above team average. Consider having them mentor others.` });
  }
  if (sp.ordersWon > avgOrders * 1.5 && sp.ordersWon >= 3) {
    suggestions.push({ type: 'strength', text: `Strong closer! ${sp.ordersWon} orders won — well above team average of ${avgOrders.toFixed(1)}.` });
  }
  if (conversionRate > 40 && sp.leads >= 5) {
    suggestions.push({ type: 'strength', text: `Excellent lead-to-prospect conversion at ${conversionRate.toFixed(0)}% — ${firstName} is qualifying leads effectively.` });
  }

  // Warnings
  if (sp.leads > avgLeads * 0.8 && sp.ordersWon === 0 && sp.leads > 3) {
    suggestions.push({ type: 'warning', text: `${firstName} has ${sp.leads} leads but zero orders won. Review their follow-up process and pipeline progression.` });
  }
  if (sp.leads > 5 && conversionRate < 15) {
    suggestions.push({ type: 'warning', text: `Low lead-to-prospect conversion (${conversionRate.toFixed(0)}%). ${firstName} may need training on lead qualification.` });
  }
  if (sp.pipelineValue > 0 && sp.ordersWon === 0) {
    suggestions.push({ type: 'warning', text: `Pipeline of ${formatCurrency(sp.pipelineValue)} but no closed orders. Help ${firstName} with negotiation and closing techniques.` });
  }
  if (sp.leads < avgLeads * 0.4 && avgLeads > 2) {
    suggestions.push({ type: 'warning', text: `${firstName} is handling fewer leads (${sp.leads}) than team average (${Math.round(avgLeads)}). Assign more leads or check workload.` });
  }

  // Target-based insights
  if (target) {
    if (target.revenuePct >= 100) {
      suggestions.push({ type: 'strength', text: `🎯 Target achieved! ${firstName} has hit ${target.revenuePct}% of revenue target. Consider revising targets upward.` });
    } else if (target.revenuePct >= 70) {
      suggestions.push({ type: 'insight', text: `${firstName} is at ${target.revenuePct}% of revenue target — on track. Focus on closing existing pipeline to hit 100%.` });
    } else if (target.revenuePct < 40 && target.revenueTarget > 0) {
      suggestions.push({ type: 'warning', text: `Only ${target.revenuePct}% of revenue target achieved. ${firstName} needs immediate pipeline acceleration and management support.` });
    }
  }

  // Actions
  if (sp.prospects > 3 && sp.pipelineValue === 0) {
    suggestions.push({ type: 'action', text: `${firstName} has ${sp.prospects} prospects not yet in pipeline. Push to convert qualified prospects into pipeline opportunities.` });
  }
  if (sp.pipelineValue > avgRevenue * 2 && sp.ordersWon < avgOrders) {
    suggestions.push({ type: 'action', text: `Large pipeline (${formatCurrency(sp.pipelineValue)}) with low closures. Schedule deal reviews to unblock stalled negotiations.` });
  }
  if (sp.leads === 0 && sp.prospects === 0 && sp.ordersWon === 0) {
    suggestions.push({ type: 'action', text: `No activity recorded for ${firstName} in this period. Check if they need onboarding support or reassignment.` });
  }

  return suggestions.slice(0, 4); // Max 4 suggestions per person
}

export function SalesCommandCenter() {

  const { user, role } = useAuth();
  const [, setSearchParams] = useSearchParams();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('this_month');
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>('all');
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
  const [targetViewPeriod, setTargetViewPeriod] = useState<'monthly' | 'quarterly'>('monthly');
  const isManager = role === 'admin' || role === 'supply_chain' || role === 'sales_manager';

  // Drill-down dialog
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogItems, setDialogItems] = useState<DetailItem[]>([]);

  const openDrillDown = useCallback((title: string, items: DetailItem[]) => {
    setDialogTitle(title);
    setDialogItems(items);
    setDetailDialogOpen(true);
  }, []);

  // Data hooks
  const { enquiries } = useEnquiries();
  const { leads: interaktLeads } = useInteraktLeads();
  const { leads: emailLeads } = useEmailLeads();
  const { pipelineOrders } = usePipelineOrders();
  const { orders } = useOrders();
  const { prospects } = useProspects();
  const { targets } = useSalesTargets();
  const { payments } = useExpectedPayments();
  const { followups } = useFollowups();
  const { callbacks } = useCallbacks();
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

  // ============ Category Breakdown (list style) ============
  const categoryBreakdown = useMemo(() => {
    const catMap = new Map<string, { value: number; count: number }>();
    activePipeline.forEach(p => {
      const cat = p.product_category || 'Uncategorized';
      const current = catMap.get(cat) || { value: 0, count: 0 };
      catMap.set(cat, { value: current.value + (p.expected_price || 0), count: current.count + 1 });
    });
    return Array.from(catMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.value - a.value);
  }, [activePipeline]);

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

  // ============ Monthly Pipeline Trend ============
  const monthlyTrend = useMemo(() => {
    const months: Record<string, { created: number; won: number; lost: number }> = {};
    filtered.pipeline.forEach(p => {
      const month = format(new Date(p.created_at), 'MMM yyyy');
      if (!months[month]) months[month] = { created: 0, won: 0, lost: 0 };
      months[month].created += p.expected_price || 0;
      if (p.status === 'won') months[month].won += p.expected_price || 0;
      else if (p.status === 'lost') months[month].lost += p.expected_price || 0;
    });
    return Object.entries(months).slice(-6).map(([month, data]) => ({ month, ...data }));
  }, [filtered.pipeline]);

  // ============ Salesperson Performance ============
  const salesPersonPerformance = useMemo(() => {
    if (!isManager || salesTeam.length === 0) return [];
    const spMap = new Map<string, { name: string; leads: number; prospects: number; pipelineValue: number; ordersWon: number; revenue: number; interakt: number; calls: number; emails: number; forms: number }>();
    salesTeam.filter((sp: any) => !sp.name?.toLowerCase().includes('test')).forEach((sp: any) => {
      spMap.set(sp.user_id, { name: sp.name, leads: 0, prospects: 0, pipelineValue: 0, ordersWon: 0, revenue: 0, interakt: 0, calls: 0, emails: 0, forms: 0 });
    });
    filtered.enquiries.forEach((e: any) => { if (e.sales_person_id) { const sp = spMap.get(e.sales_person_id); if (sp) sp.leads++; } });
    filtered.interakt.forEach((l: any) => { if (l.sales_person_id) { const sp = spMap.get(l.sales_person_id); if (sp) sp.interakt++; } });
    filtered.calls.forEach((c: any) => { if (c.sales_person_id) { const sp = spMap.get(c.sales_person_id); if (sp) sp.calls++; } });
    filtered.email.forEach((e: any) => { if (e.sales_person_id) { const sp = spMap.get(e.sales_person_id); if (sp) sp.emails++; } });
    filtered.forms.forEach((f: any) => { if (f.sales_person_id) { const sp = spMap.get(f.sales_person_id); if (sp) sp.forms++; } });
    filtered.prospects.forEach((p: any) => { if (p.created_by) { const sp = spMap.get(p.created_by); if (sp) sp.prospects++; } });
    filtered.pipeline.forEach(p => { if (p.sales_person_id) { const sp = spMap.get(p.sales_person_id); if (sp && p.status !== 'won' && p.status !== 'lost') sp.pipelineValue += p.expected_price || 0; } });
    filtered.orders.forEach(o => { if (o.sales_person_id) { const sp = spMap.get(o.sales_person_id); if (sp) { sp.ordersWon++; sp.revenue += o.total_sales_amount || 0; } } });
    return Array.from(spMap.entries())
      .map(([id, data]) => ({ id, totalLeads: data.leads + data.interakt + data.calls + data.emails + data.forms, ...data }))
      .sort((a, b) => b.revenue - a.revenue || b.totalLeads - a.totalLeads);
  }, [isManager, salesTeam, filtered]);

  // ============ Target vs Achieved ============
  const [targetViewPeriod, setTargetViewPeriod] = useState<'monthly' | 'quarterly'>('monthly');
  const targetComparison = useMemo(() => {
    const now = new Date();
    return targets
      .filter(t => t.target_period === targetViewPeriod && new Date(t.period_start) <= now && new Date(t.period_end) >= now)
      .map(t => {
        // Filter orders/pipeline by the target's period range
        const pStart = new Date(t.period_start);
        const pEnd = new Date(t.period_end);
        const spOrders = orders.filter(o => o.sales_person_id === t.user_id && new Date(o.created_at) >= pStart && new Date(o.created_at) <= pEnd);
        const spPipeline = pipelineOrders.filter(p => p.sales_person_id === t.user_id && p.status !== 'won' && p.status !== 'lost' && new Date(p.created_at) >= pStart && new Date(p.created_at) <= pEnd);
        const revenue = spOrders.reduce((s, o) => s + (o.total_sales_amount || 0), 0);
        const pipeVal = spPipeline.reduce((s, p) => s + (p.expected_price || 0), 0);
        return {
          name: t.user_name.split(' ')[0], // First name for chart
          fullName: t.user_name,
          revenueTarget: t.revenue_target,
          revenueAchieved: revenue,
          ordersTarget: t.orders_target,
          ordersAchieved: spOrders.length,
          pipelineTarget: t.pipeline_target,
          pipelineAchieved: pipeVal,
          revenuePct: t.revenue_target > 0 ? Math.round((revenue / t.revenue_target) * 100) : 0,
          pipelinePct: t.pipeline_target > 0 ? Math.round((pipeVal / t.pipeline_target) * 100) : 0,
        };
      })
      .sort((a, b) => b.revenueAchieved - a.revenueAchieved);
  }, [targets, orders, pipelineOrders, targetViewPeriod]);

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

  // Pipeline by category (for bar chart)
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

  // Call stats
  const callStats = useMemo(() => {
    const isAnswered = (c: any) => {
      const payload = c.raw_payload;
      if (!payload?._ld || !Array.isArray(payload._ld)) return c.call_status === 'answered';
      return (payload._ld as any[]).some((l: any) => l._ac === 'received');
    };
    const answered = filtered.calls.filter(isAnswered).length;
    const missed = filtered.calls.length - answered;
    const answerRate = filtered.calls.length > 0 ? ((answered / filtered.calls.length) * 100).toFixed(1) : '0';

    // Agent-wise breakdown
    const agentMap = new Map<string, { total: number; answered: number; missed: number }>();
    filtered.calls.forEach((c: any) => {
      const agent = c.assigned_agent_name || c.agent_name || 'Unassigned';
      if (!agentMap.has(agent)) agentMap.set(agent, { total: 0, answered: 0, missed: 0 });
      const entry = agentMap.get(agent)!;
      entry.total++;
      if (isAnswered(c)) entry.answered++;
      else entry.missed++;
    });
    const agentBreakdown = Array.from(agentMap.entries())
      .map(([name, data]) => ({ name, ...data, answerRate: data.total > 0 ? ((data.answered / data.total) * 100).toFixed(1) : '0' }))
      .sort((a, b) => b.total - a.total);

    // Daily trend (last 7 days)
    const dailyCallTrend = Array.from({ length: 7 }, (_, i) => {
      const date = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
      const dayCalls = filtered.calls.filter((c: any) => c.created_at?.startsWith(date));
      const dayAnswered = dayCalls.filter(isAnswered).length;
      return {
        date: format(subDays(new Date(), 6 - i), 'MMM d'),
        received: dayCalls.length,
        answered: dayAnswered,
        missed: dayCalls.length - dayAnswered,
      };
    });

    // Hourly distribution
    const hourlyDist = Array.from({ length: 12 }, (_, i) => {
      const hour = i + 8; // 8 AM to 7 PM
      const hourCalls = filtered.calls.filter((c: any) => {
        const st = c.start_time || c.created_at;
        if (!st) return false;
        const h = new Date(st).getHours();
        return h === hour;
      });
      return {
        hour: `${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'PM' : 'AM'}`,
        calls: hourCalls.length,
        answered: hourCalls.filter(isAnswered).length,
      };
    });

    return { total: filtered.calls.length, answered, missed, answerRate, agentBreakdown, dailyCallTrend, hourlyDist };
  }, [filtered.calls]);

  // Expected Payments Timeline (30 days)
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

  // ============ DRILL-DOWN HANDLERS ============
  const handleCategoryClick = useCallback((category: string) => {
    const items: DetailItem[] = activePipeline
      .filter(p => (p.product_category || 'Uncategorized') === category)
      .map(p => ({
        id: p.id, type: 'pipeline' as const, customer_name: p.customer_name,
        customer_company: p.customer_company, product_name: p.product_name,
        value: p.expected_price || 0, date: p.created_at, status: p.status,
        temperature: p.lead_temperature, tab: 'pipeline',
      }));
    openDrillDown(`${category} Pipeline (${items.length})`, items);
  }, [activePipeline, openDrillDown]);

  const handleStateClick = useCallback((state: string) => {
    const items: DetailItem[] = activePipeline
      .filter(p => ((p as any).customer_state || 'Unknown') === state)
      .map(p => ({
        id: p.id, type: 'pipeline' as const, customer_name: p.customer_name,
        customer_company: p.customer_company, product_name: p.product_name,
        value: p.expected_price || 0, date: p.created_at, status: p.status,
        temperature: p.lead_temperature, tab: 'pipeline',
      }));
    openDrillDown(`${state} Pipeline (${items.length})`, items);
  }, [activePipeline, openDrillDown]);

  const handleTemperatureClick = useCallback((temp: string) => {
    const tempLower = temp.toLowerCase();
    const items: DetailItem[] = activePipeline
      .filter(p => (p.lead_temperature || 'warm') === tempLower)
      .map(p => ({
        id: p.id, type: 'pipeline' as const, customer_name: p.customer_name,
        customer_company: p.customer_company, product_name: p.product_name,
        value: p.expected_price || 0, date: p.created_at, status: p.status,
        temperature: p.lead_temperature, tab: 'pipeline',
      }));
    openDrillDown(`${temp} Leads (${items.length})`, items);
  }, [activePipeline, openDrillDown]);

  const handleEnquiryStatusClick = useCallback((status: string) => {
    const statusKey = status.toLowerCase().replace(/ /g, '_');
    const statusMap: Record<string, string> = { pending: 'pending', responded: 'responded', pipeline: 'moved_to_pipeline', won: 'order_won', lost: 'order_lost', 'on hold': 'on_hold' };
    const mapped = statusMap[status.toLowerCase()] || statusKey;
    const items: DetailItem[] = filtered.enquiries
      .filter((e: any) => e.status === mapped)
      .map((e: any) => ({
        id: e.id, type: 'enquiry' as const, customer_name: e.customer_name,
        customer_company: e.customer_company, product_name: e.product_name,
        value: e.quantity || 0, date: e.created_at, status: e.status,
        temperature: e.lead_temperature, tab: 'enquiries',
      }));
    openDrillDown(`${status} Enquiries (${items.length})`, items);
  }, [filtered.enquiries, openDrillDown]);

  const handlePipelineStatusClick = useCallback((status: string) => {
    const statusMap: Record<string, string> = { pending: 'pending_confirmation', negotiation: 'negotiation', won: 'won', lost: 'lost' };
    const mapped = statusMap[status.toLowerCase()] || status.toLowerCase();
    const items: DetailItem[] = filtered.pipeline
      .filter(p => p.status === mapped)
      .map(p => ({
        id: p.id, type: 'pipeline' as const, customer_name: p.customer_name,
        customer_company: p.customer_company, product_name: p.product_name,
        value: p.expected_price || 0, date: p.created_at, status: p.status,
        temperature: p.lead_temperature, tab: 'pipeline',
      }));
    openDrillDown(`${status} Pipeline (${items.length})`, items);
  }, [filtered.pipeline, openDrillDown]);

  const handleFunnelClick = useCallback((stage: string) => {
    if (stage === 'Total Leads') {
      const items: DetailItem[] = filtered.enquiries.slice(0, 50).map((e: any) => ({
        id: e.id, type: 'enquiry' as const, customer_name: e.customer_name,
        customer_company: e.customer_company, product_name: e.product_name,
        value: e.quantity || 0, date: e.created_at, status: e.status, tab: 'enquiries',
      }));
      openDrillDown(`All Leads (showing ${items.length})`, items);
    } else if (stage === 'Prospects') {
      const items: DetailItem[] = filtered.prospects.slice(0, 50).map((p: any) => ({
        id: p.id, type: 'prospect' as const, customer_name: p.customer_name,
        customer_company: p.company || '', product_name: p.product_name || '',
        value: 0, date: p.created_at, status: p.is_a_category ? 'A-Category' : 'Prospect', tab: 'prospects',
      }));
      openDrillDown(`Prospects (showing ${items.length})`, items);
    } else if (stage === 'Pipeline') {
      const items: DetailItem[] = activePipeline.slice(0, 50).map(p => ({
        id: p.id, type: 'pipeline' as const, customer_name: p.customer_name,
        customer_company: p.customer_company, product_name: p.product_name,
        value: p.expected_price || 0, date: p.created_at, status: p.status, tab: 'pipeline',
      }));
      openDrillDown(`Active Pipeline (showing ${items.length})`, items);
    } else if (stage === 'Orders Won') {
      const items: DetailItem[] = filtered.orders.slice(0, 50).map(o => ({
        id: o.id, type: 'pipeline' as const, customer_name: o.customer_name || '',
        customer_company: o.customer_company || '', product_name: o.product_name || '',
        value: o.total_sales_amount || 0, date: o.created_at, status: 'won', tab: 'pipeline',
      }));
      openDrillDown(`Orders Won (showing ${items.length})`, items);
    }
  }, [filtered, activePipeline, openDrillDown]);

  const handleInflowChartClick = useCallback((data: any) => {
    if (!data?.activePayload?.length) return;
    const clickedDate = data.activeLabel;
    const now = new Date();
    const endDate = addMonths(now, 1);
    const days = eachDayOfInterval({ start: now, end: endDate });
    const targetDay = days.find(d => format(d, 'MMM d') === clickedDate);
    if (!targetDay) return;

    const dayPayments = payments.filter(p => {
      if (!p.expected_date || p.status === 'received') return false;
      return isSameDay(parseISO(p.expected_date), targetDay);
    });
    const pipelineClosures = activePipeline.filter(p => {
      if (!p.expected_closure_date) return false;
      return isSameDay(parseISO(p.expected_closure_date), targetDay);
    });

    const items: DetailItem[] = [
      ...dayPayments.map(p => ({
        id: p.id, type: 'payment' as const, customer_name: p.customer_name,
        customer_company: p.customer_company || '', product_name: p.order_number || 'Payment',
        value: p.amount, date: p.expected_date, status: p.status, tab: 'pipeline',
      })),
      ...pipelineClosures.map(p => ({
        id: p.id, type: 'pipeline' as const, customer_name: p.customer_name,
        customer_company: p.customer_company, product_name: p.product_name,
        value: p.expected_price || 0, date: p.expected_closure_date || '', status: p.status,
        temperature: p.lead_temperature, tab: 'pipeline',
      })),
    ];
    openDrillDown(`Expected Inflows - ${clickedDate} (${items.length} items)`, items);
  }, [payments, activePipeline, openDrillDown]);

  const handleLeadSourceClick = useCallback((sourceName: string) => {
    let items: DetailItem[] = [];
    if (sourceName === 'Enquiries') {
      items = filtered.enquiries.slice(0, 50).map((e: any) => ({
        id: e.id, type: 'enquiry' as const, customer_name: e.customer_name,
        customer_company: e.customer_company, product_name: e.product_name,
        value: e.quantity || 0, date: e.created_at, status: e.status, tab: 'enquiries',
      }));
    } else if (sourceName === 'Interakt') {
      items = filtered.interakt.slice(0, 50).map((l: any) => ({
        id: l.id, type: 'lead' as const, customer_name: l.customer_name || l.name || 'Unknown',
        customer_company: l.company || '', product_name: l.product_name || '',
        value: 0, date: l.created_at, status: l.status || 'new', tab: 'leads',
      }));
    } else if (sourceName === 'MyOperator') {
      items = filtered.calls.slice(0, 50).map((c: any) => ({
        id: c.id, type: 'lead' as const, customer_name: c.customer_name || c.caller_number,
        customer_company: c.company || '', product_name: c.product_name || '',
        value: 0, date: c.created_at, status: c.call_status, tab: 'leads',
      }));
    } else if (sourceName === 'Emails') {
      items = filtered.email.slice(0, 50).map((e: any) => ({
        id: e.id, type: 'lead' as const, customer_name: e.customer_name,
        customer_company: e.customer_company || '', product_name: e.product_name || '',
        value: 0, date: e.created_at, status: e.status || 'new', tab: 'leads',
      }));
    } else if (sourceName === 'Forms') {
      items = filtered.forms.slice(0, 50).map((f: any) => ({
        id: f.id, type: 'lead' as const, customer_name: f.customer_name || f.name || 'Unknown',
        customer_company: f.company || '', product_name: f.product_name || '',
        value: 0, date: f.created_at, status: f.status || 'new', tab: 'leads',
      }));
    }
    openDrillDown(`${sourceName} (${items.length})`, items);
  }, [filtered, openDrillDown]);

  // Navigate to detail tab and open specific record
  const handleItemClick = useCallback((item: DetailItem) => {
    setDetailDialogOpen(false);
    const tabMap: Record<string, string> = {
      enquiries: 'enquiries',
      pipeline: 'pipeline',
      prospects: 'prospects',
      leads: 'leads',
    };
    const tabValue = tabMap[item.tab || ''];
    if (tabValue) {
      // Use URL search params to navigate — Sales.tsx reads 'tab' and 'leadId'
      setTimeout(() => {
        setSearchParams(prev => {
          const params = new URLSearchParams(prev);
          params.set('tab', tabValue);
          if (item.id) params.set('leadId', item.id);
          return params;
        });
      }, 150);
    }
  }, [setSearchParams]);

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
            {Object.entries(TIME_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
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
              <Calendar mode="range" selected={customDateRange} onSelect={setCustomDateRange} numberOfMonths={2} />
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

      {/* ============ ENQUIRIES RECEIVED vs ACHIEVED + LEAD SOURCES + QUICK STATS ============ */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
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
                <div
                  key={src.name}
                  className="space-y-1 cursor-pointer hover:bg-muted/50 p-1.5 rounded-lg -m-1.5 transition-colors"
                  onClick={() => handleLeadSourceClick(src.name)}
                >
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
                    <Badge key={ps.name} variant="secondary" className="text-xs">{ps.name}: {ps.value}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============ MYOPERATOR CALL ANALYTICS ============ */}
      {callStats.total > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Call Summary Cards */}
          <Card className="md:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Phone className="w-4 h-4 text-primary" />
                MyOperator Call Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <p className="text-3xl font-bold">{callStats.total}</p>
                <p className="text-xs text-muted-foreground">Total Calls Received</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-3 rounded-lg bg-emerald-500/10">
                  <p className="text-xl font-bold text-emerald-600">{callStats.answered}</p>
                  <p className="text-xs text-muted-foreground">Attended</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-destructive/10">
                  <p className="text-xl font-bold text-destructive">{callStats.missed}</p>
                  <p className="text-xs text-muted-foreground">Missed</p>
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-primary/10">
                <p className="text-lg font-bold text-primary">{callStats.answerRate}%</p>
                <p className="text-xs text-muted-foreground">Answer Rate</p>
              </div>
            </CardContent>
          </Card>

          {/* 7-Day Call Trend */}
          <Card className="md:col-span-5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Call Trend (Last 7 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={callStats.dailyCallTrend} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <Bar dataKey="answered" name="Attended" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} stackId="calls" />
                  <Bar dataKey="missed" name="Missed" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} stackId="calls" />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Agent-wise Breakdown */}
          <Card className="md:col-span-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Agent Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[220px]">
                <div className="space-y-2">
                  {callStats.agentBreakdown.filter(a => a.name !== 'Unassigned').map(agent => (
                    <div key={agent.name} className="p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium truncate max-w-[120px]">{agent.name}</span>
                        <span className="text-xs text-muted-foreground">{agent.total} calls</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-muted/60 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${agent.answerRate}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium min-w-[32px] text-right">{agent.answerRate}%</span>
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="text-emerald-600">✓ {agent.answered}</span>
                        <span className="text-destructive">✗ {agent.missed}</span>
                      </div>
                    </div>
                  ))}
                  {callStats.agentBreakdown.filter(a => a.name === 'Unassigned').length > 0 && (
                    <div className="p-2 rounded-lg bg-muted/30 text-center">
                      <span className="text-xs text-muted-foreground">
                        {callStats.agentBreakdown.find(a => a.name === 'Unassigned')?.total || 0} unassigned calls
                      </span>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}


      {categoryBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              Category Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {categoryBreakdown.map((cat, index) => (
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
                      Avg: {formatCurrency(cat.count > 0 ? cat.value / cat.count : 0)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============ TARGET VS ACHIEVED (Revenue & Pipeline) ============ */}
      {isManager && targetComparison.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                Target vs Achieved
              </CardTitle>
              <div className="flex gap-1">
                {(['monthly', 'quarterly'] as const).map(p => (
                  <Button
                    key={p}
                    variant={targetViewPeriod === p ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-7 px-3"
                    onClick={() => setTargetViewPeriod(p)}
                  >
                    {p === 'monthly' ? 'Monthly' : 'Quarterly'}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Revenue Target vs Achieved */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" /> Revenue — Target vs Achieved
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={targetComparison} layout="vertical" barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                    <XAxis type="number" className="text-xs" tickFormatter={(v) => formatCurrency(v)} />
                    <YAxis type="category" dataKey="name" className="text-xs" width={70} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="revenueTarget" name="Target" fill="hsl(var(--muted-foreground) / 0.25)" radius={[0, 4, 4, 0]} barSize={14} />
                    <Bar dataKey="revenueAchieved" name="Achieved" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Pipeline Target vs Achieved */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> Pipeline — Target vs Achieved
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={targetComparison} layout="vertical" barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                    <XAxis type="number" className="text-xs" tickFormatter={(v) => formatCurrency(v)} />
                    <YAxis type="category" dataKey="name" className="text-xs" width={70} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="pipelineTarget" name="Target" fill="hsl(var(--muted-foreground) / 0.25)" radius={[0, 4, 4, 0]} barSize={14} />
                    <Bar dataKey="pipelineAchieved" name="Achieved" fill="hsl(var(--chart-4))" radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Summary badges */}
            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border/30">
              {targetComparison.map(t => (
                <Badge
                  key={t.name}
                  variant={t.revenuePct >= 100 ? 'default' : t.revenuePct >= 70 ? 'secondary' : 'destructive'}
                  className="text-xs gap-1"
                >
                  {t.name}: {t.revenuePct}% Rev · {t.pipelinePct}% Pipe
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============ SALESPERSON COMPARISON ============ */}
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

      {/* ============ AI PERFORMANCE SUGGESTIONS ============ */}
      {isManager && salesPersonPerformance.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              AI Performance Insights & Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {salesPersonPerformance.map(sp => {
                const suggestions = generatePerformanceSuggestions(sp, salesPersonPerformance, targetComparison);
                if (suggestions.length === 0) return null;
                return (
                  <div key={sp.id} className="rounded-lg border border-border/50 p-4 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                        {sp.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{sp.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {sp.totalLeads} leads · {sp.prospects} prospects · {sp.ordersWon} orders · {formatCurrency(sp.revenue)} revenue
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1.5 pl-10">
                      {suggestions.map((s, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          {s.type === 'strength' && <ThumbsUp className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" />}
                          {s.type === 'warning' && <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />}
                          {s.type === 'action' && <ArrowUpRight className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />}
                          {s.type === 'insight' && <Lightbulb className="w-3.5 h-3.5 mt-0.5 text-violet-500 shrink-0" />}
                          <span className="text-muted-foreground leading-snug">{s.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ============ SALES FUNNEL (Clickable) ============ */}
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
                  <div
                    key={stage.stage}
                    className="space-y-1 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => handleFunnelClick(stage.stage)}
                  >
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{stage.stage}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{stage.value}</span>
                        {convPct && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">{convPct}% conv</Badge>
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

        {/* ============ ENQUIRY STATUS PIE (Clickable) ============ */}
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
                  <Pie
                    data={enquiryStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={90}
                    paddingAngle={3} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    onClick={(data) => handleEnquiryStatusClick(data.name)}
                    style={{ cursor: 'pointer' }}
                  >
                    {enquiryStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ============ PIPELINE STATUS (Clickable) ============ */}
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
                  <Pie
                    data={pipelineStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={90}
                    paddingAngle={3} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    onClick={(data) => handlePipelineStatusClick(data.name)}
                    style={{ cursor: 'pointer' }}
                  >
                    {pipelineStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ============ PIPELINE BY CATEGORY (Bar Chart, Clickable) ============ */}
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
                  <Bar
                    dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Value"
                    onClick={(data) => handleCategoryClick(data.name)}
                    style={{ cursor: 'pointer' }}
                  />
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
                  <Bar
                    dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Pipeline Value"
                    onClick={(data) => handleStateClick(data.state)}
                    style={{ cursor: 'pointer' }}
                  />
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
              <div className="space-y-4">
                {pipelineByTemperature.map((temp) => (
                  <div
                    key={temp.name}
                    className="space-y-1 cursor-pointer hover:bg-muted/50 p-2 rounded-lg -m-2 transition-colors"
                    onClick={() => handleTemperatureClick(temp.name)}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: temp.color }} />
                        <span>{temp.name}</span>
                      </div>
                      <span className="font-medium">{formatCurrency(temp.value)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pipelineValue > 0 ? (temp.value / pipelineValue) * 100 : 0}%`,
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
      </div>

      {/* ============ MONTHLY PIPELINE TREND ============ */}
      {monthlyTrend.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Monthly Pipeline Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis tickFormatter={formatCurrency} className="text-xs" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [formatCurrency(v), name === 'created' ? 'Created' : name === 'won' ? 'Won' : 'Lost']} />
                <Legend />
                <Bar dataKey="created" name="Created" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="won" name="Won" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lost" name="Lost" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ============ EXPECTED INFLOWS TIMELINE (Clickable) ============ */}
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
              <BarChart data={paymentsTimeline} onClick={handleInflowChartClick} style={{ cursor: 'pointer' }}>
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

      {/* ============ 14-DAY ACTIVITY TREND ============ */}
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

      {/* ============ SALESPERSON DEEP DIVE ============ */}
      {isManager && (
        <SalesPersonDeepDive
          salesTeam={salesTeam}
          enquiries={filtered.enquiries}
          interaktLeads={filtered.interakt}
          emailLeads={filtered.email}
          callLogs={filtered.calls}
          formLeads={filtered.forms}
          pipelineOrders={filtered.pipeline}
          orders={filtered.orders}
          prospects={filtered.prospects}
          targets={targets}
          followups={followups}
          callbacks={callbacks}
          isManager={isManager}
        />
      )}

      {/* ============ DRILL-DOWN DETAIL DIALOG ============ */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">{dialogTitle}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            {dialogItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No items found</div>
            ) : (
              <div className="space-y-2">
                {dialogItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer group"
                    onClick={() => handleItemClick(item)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">{item.customer_name}</span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {item.type === 'payment' ? 'Payment' : item.type === 'prospect' ? 'Prospect' : item.type === 'lead' ? 'Lead' : item.type === 'enquiry' ? 'Enquiry' : 'Pipeline'}
                        </Badge>
                        {item.temperature && (
                          <LeadTemperatureBadge temperature={item.temperature as any} showLabel={false} size="sm" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {item.customer_company && (
                          <>
                            <Building2 className="w-3 h-3" />
                            <span className="truncate">{item.customer_company}</span>
                            <span>•</span>
                          </>
                        )}
                        <span className="truncate">{item.product_name || item.status}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <div className="text-right">
                        {item.value > 0 && <p className="font-semibold text-primary">{formatCurrency(item.value)}</p>}
                        <p className="text-xs text-muted-foreground">
                          {item.date ? format(new Date(item.date), 'dd MMM yyyy') : '—'}
                        </p>
                      </div>
                      <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
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
