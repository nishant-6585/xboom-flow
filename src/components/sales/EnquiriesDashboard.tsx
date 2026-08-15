import { useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Enquiry } from '@/hooks/useEnquiries';
import {
  Package, Clock, CheckCircle2, AlertTriangle, ArrowRight, XCircle,
  Pause, TrendingUp, Timer, BarChart3, CalendarIcon, Activity,
  Users, Zap, Flame, Award, Percent, Send, Eye, ShoppingCart,
  ExternalLink,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend, AreaChart, Area,
} from 'recharts';
import {
  format, differenceInMinutes, parseISO, startOfMonth, endOfMonth,
  eachMonthOfInterval, subMonths, startOfWeek, endOfWeek, subWeeks,
  startOfDay, endOfDay, subDays, isAfter, isBefore, eachDayOfInterval,
} from 'date-fns';
import { LeadTemperatureBadge } from '@/components/LeadTemperatureBadge';
import type { DateRange } from 'react-day-picker';

interface EnquiriesDashboardProps {
  enquiries: Enquiry[];
}

type TimeFilter = 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'last_90' | 'all' | 'custom';

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

function getDateRange(filter: TimeFilter, customRange?: { from?: Date; to?: Date }) {
  const now = new Date();
  switch (filter) {
    case 'today': return { start: startOfDay(now), end: endOfDay(now) };
    case 'this_week': return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'last_week': { const s = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }); return { start: s, end: endOfWeek(s, { weekStartsOn: 1 }) }; }
    case 'this_month': return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last_month': { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return { start: startOfMonth(lm), end: endOfMonth(lm) }; }
    case 'last_90': return { start: subDays(now, 90), end: now };
    case 'custom': {
      if (customRange?.from) return { start: startOfDay(customRange.from), end: customRange.to ? endOfDay(customRange.to) : endOfDay(customRange.from) };
      return { start: startOfMonth(now), end: endOfMonth(now) };
    }
    case 'all': return { start: new Date(2020, 0, 1), end: now };
  }
}

function isInRange(dateStr: string | null | undefined, range: { start: Date; end: Date }): boolean {
  if (!dateStr) return false;
  try { const d = parseISO(dateStr); return !isBefore(d, range.start) && !isAfter(d, range.end); } catch { return false; }
}

const formatCurrency = (value: number) => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value.toFixed(0)}`;
};

const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: '12px',
};

const COLORS = [
  'hsl(var(--primary))', 'hsl(var(--chart-1))', 'hsl(var(--chart-2))',
  'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))',
  '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Package }> = {
  pending: { label: 'Pending', color: '#f59e0b', icon: Clock },
  responded: { label: 'Responded', color: '#3b82f6', icon: CheckCircle2 },
  on_hold: { label: 'On Hold', color: '#6b7280', icon: Pause },
  moved_to_pipeline: { label: 'Pipeline', color: '#8b5cf6', icon: ArrowRight },
  order_won: { label: 'Won', color: '#22c55e', icon: CheckCircle2 },
  order_lost: { label: 'Lost', color: '#ef4444', icon: XCircle },
};

interface DetailItem {
  id: string;
  customer_name: string;
  customer_company: string;
  product_name: string;
  quantity: number;
  status: string;
  date: string;
  sales_person: string;
  temperature?: string;
}

export function EnquiriesDashboard({ enquiries }: EnquiriesDashboardProps) {
  const [, setSearchParams] = useSearchParams();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('this_month');
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>('all');
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogItems, setDialogItems] = useState<DetailItem[]>([]);

  const dateRange = getDateRange(timeFilter, customDateRange);

  const salesPersons = useMemo(() =>
    Array.from(new Set(enquiries.map(e => e.sales_person_name))).filter(Boolean).sort(),
  [enquiries]);

  // Filtered enquiries
  const filtered = useMemo(() => {
    let result = timeFilter === 'all' ? enquiries : enquiries.filter(e => isInRange(e.created_at, dateRange));
    if (salesPersonFilter !== 'all') result = result.filter(e => e.sales_person_name === salesPersonFilter);
    return result;
  }, [enquiries, timeFilter, dateRange, salesPersonFilter]);

  const openDrillDown = useCallback((title: string, items: DetailItem[]) => {
    setDialogTitle(title);
    setDialogItems(items);
    setDetailDialogOpen(true);
  }, []);

  const toDetailItem = useCallback((e: Enquiry): DetailItem => ({
    id: e.id, customer_name: e.customer_name, customer_company: e.customer_company,
    product_name: e.product_name, quantity: e.quantity, status: e.status,
    date: e.created_at, sales_person: e.sales_person_name, temperature: e.lead_temperature,
  }), []);

  // ============ STATS ============
  const stats = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    let totalResponseMinutes = 0;
    let respondedCount = 0;
    let slaMetCount = 0;
    let slaBreachedCount = 0;

    for (const e of filtered) {
      statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
      if (e.responded_at && e.created_at) {
        const mins = differenceInMinutes(parseISO(e.responded_at), parseISO(e.created_at));
        if (mins >= 0) {
          totalResponseMinutes += mins;
          respondedCount++;
          if (mins <= 24 * 60) slaMetCount++; else slaBreachedCount++;
        }
      }
    }

    const avgResponseMinutes = respondedCount > 0 ? Math.round(totalResponseMinutes / respondedCount) : 0;
    const avgHours = Math.floor(avgResponseMinutes / 60);
    const avgMins = avgResponseMinutes % 60;
    const pendingCount = statusCounts['pending'] || 0;
    const pendingUrgent = filtered.filter(e => e.status === 'pending' && (e.urgency === 'high' || e.urgency === 'critical')).length;
    const hotLeads = filtered.filter(e => e.lead_temperature === 'hot').length;
    const megaDeals = filtered.filter(e => e.is_mega_deal).length;
    const conversionRate = filtered.length > 0
      ? Math.round(((statusCounts['order_won'] || 0) + (statusCounts['moved_to_pipeline'] || 0)) / filtered.length * 100)
      : 0;
    const winRate = filtered.length > 0
      ? Math.round((statusCounts['order_won'] || 0) / filtered.length * 100)
      : 0;

    return {
      total: filtered.length, statusCounts,
      avgResponseTime: avgHours > 0 ? `${avgHours}h ${avgMins}m` : `${avgMins}m`,
      respondedCount, pendingCount, pendingUrgent, slaMetCount, slaBreachedCount,
      conversionRate, winRate, hotLeads, megaDeals,
    };
  }, [filtered]);

  // ============ CHARTS DATA ============
  // Enquiry status pie
  const statusPieData = useMemo(() =>
    Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({
      name: cfg.label, value: stats.statusCounts[key] || 0, color: cfg.color,
    })).filter(d => d.value > 0),
  [stats.statusCounts]);

  // Category breakdown
  const categoryData = useMemo(() => {
    const catMap = new Map<string, number>();
    filtered.forEach(e => {
      const cat = e.product_category || 'Uncategorized';
      catMap.set(cat, (catMap.get(cat) || 0) + 1);
    });
    return Array.from(catMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filtered]);

  // Temperature breakdown
  const temperatureData = useMemo(() => {
    const tempMap: Record<string, number> = { hot: 0, warm: 0, cold: 0 };
    filtered.forEach(e => { tempMap[e.lead_temperature || 'warm']++; });
    return [
      { name: 'Hot', value: tempMap.hot, color: '#ef4444' },
      { name: 'Warm', value: tempMap.warm, color: '#f59e0b' },
      { name: 'Cold', value: tempMap.cold, color: '#3b82f6' },
    ].filter(t => t.value > 0);
  }, [filtered]);

  // Monthly trend (last 6 months — always absolute, ignoring time filter)
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months = eachMonthOfInterval({ start: subMonths(startOfMonth(now), 5), end: startOfMonth(now) });
    return months.map(month => {
      const monthEnd = endOfMonth(month);
      const monthEnquiries = enquiries.filter(e => {
        const d = parseISO(e.created_at);
        return d >= month && d <= monthEnd;
      });
      return {
        month: format(month, 'MMM yy'),
        total: monthEnquiries.length,
        responded: monthEnquiries.filter(e => e.status !== 'pending' && e.status !== 'on_hold').length,
        won: monthEnquiries.filter(e => e.status === 'order_won').length,
        lost: monthEnquiries.filter(e => e.status === 'order_lost').length,
      };
    });
  }, [enquiries]);

  // Daily trend (14 days)
  const dailyTrend = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const date = format(subDays(new Date(), 13 - i), 'yyyy-MM-dd');
      const dayEnquiries = enquiries.filter(e => e.created_at?.startsWith(date));
      return {
        date: format(subDays(new Date(), 13 - i), 'MMM d'),
        total: dayEnquiries.length,
        responded: dayEnquiries.filter(e => e.status !== 'pending').length,
      };
    });
  }, [enquiries]);

  // Avg response time by sales person
  const salesPersonStats = useMemo(() => {
    const map: Record<string, { total: number; responseMinutes: number; responded: number; won: number; lost: number; pending: number }> = {};
    for (const e of filtered) {
      const name = e.sales_person_name || 'Unassigned';
      if (!map[name]) map[name] = { total: 0, responseMinutes: 0, responded: 0, won: 0, lost: 0, pending: 0 };
      map[name].total++;
      if (e.status === 'order_won') map[name].won++;
      if (e.status === 'order_lost') map[name].lost++;
      if (e.status === 'pending') map[name].pending++;
      if (e.responded_at && e.created_at) {
        const mins = differenceInMinutes(parseISO(e.responded_at), parseISO(e.created_at));
        if (mins >= 0) { map[name].responseMinutes += mins; map[name].responded++; }
      }
    }
    return Object.entries(map)
      .map(([name, data]) => ({
        name: name.split(' ')[0], fullName: name,
        total: data.total, won: data.won, lost: data.lost, pending: data.pending,
        avgHours: data.responded > 0 ? Math.round(data.responseMinutes / data.responded / 60 * 10) / 10 : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [filtered]);

  // Urgency breakdown
  const urgencyData = useMemo(() => {
    const urgMap: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    filtered.forEach(e => { urgMap[e.urgency] = (urgMap[e.urgency] || 0) + 1; });
    return [
      { name: 'Critical', value: urgMap.critical, color: '#ef4444' },
      { name: 'High', value: urgMap.high, color: '#f97316' },
      { name: 'Medium', value: urgMap.medium, color: '#eab308' },
      { name: 'Low', value: urgMap.low, color: '#22c55e' },
    ].filter(u => u.value > 0);
  }, [filtered]);

  // Lost reason breakdown
  const lostReasonData = useMemo(() => {
    const reasonMap = new Map<string, number>();
    filtered.filter(e => e.status === 'order_lost' && e.lost_reason).forEach(e => {
      const reason = e.lost_reason || 'unknown';
      reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
    });
    return Array.from(reasonMap.entries())
      .map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  // ============ DRILL-DOWN HANDLERS ============
  const handleStatusClick = useCallback((statusLabel: string) => {
    const statusMap: Record<string, string> = {
      Pending: 'pending', Responded: 'responded', 'On Hold': 'on_hold',
      Pipeline: 'moved_to_pipeline', Won: 'order_won', Lost: 'order_lost',
    };
    const mapped = statusMap[statusLabel];
    if (!mapped) return;
    const items = filtered.filter(e => e.status === mapped).map(toDetailItem);
    openDrillDown(`${statusLabel} Enquiries (${items.length})`, items);
  }, [filtered, toDetailItem, openDrillDown]);

  const handleCategoryClick = useCallback((category: string) => {
    const items = filtered.filter(e => (e.product_category || 'Uncategorized') === category).map(toDetailItem);
    openDrillDown(`${category} Enquiries (${items.length})`, items);
  }, [filtered, toDetailItem, openDrillDown]);

  const handleTempClick = useCallback((temp: string) => {
    const tempLower = temp.toLowerCase();
    const items = filtered.filter(e => (e.lead_temperature || 'warm') === tempLower).map(toDetailItem);
    openDrillDown(`${temp} Leads (${items.length})`, items);
  }, [filtered, toDetailItem, openDrillDown]);

  const handleKPIClick = useCallback((type: string) => {
    let items: DetailItem[] = [];
    let title = '';
    switch (type) {
      case 'total': items = filtered.map(toDetailItem); title = `All Enquiries (${items.length})`; break;
      case 'pending': items = filtered.filter(e => e.status === 'pending').map(toDetailItem); title = `Pending Enquiries (${items.length})`; break;
      case 'hot': items = filtered.filter(e => e.lead_temperature === 'hot').map(toDetailItem); title = `Hot Leads (${items.length})`; break;
      case 'mega': items = filtered.filter(e => e.is_mega_deal).map(toDetailItem); title = `Mega Deals (${items.length})`; break;
      case 'won': items = filtered.filter(e => e.status === 'order_won').map(toDetailItem); title = `Orders Won (${items.length})`; break;
      case 'lost': items = filtered.filter(e => e.status === 'order_lost').map(toDetailItem); title = `Orders Lost (${items.length})`; break;
      case 'sla_met': items = filtered.filter(e => e.responded_at && e.created_at && differenceInMinutes(parseISO(e.responded_at), parseISO(e.created_at)) <= 1440).map(toDetailItem); title = `SLA Met (${items.length})`; break;
      case 'sla_breached': items = filtered.filter(e => e.responded_at && e.created_at && differenceInMinutes(parseISO(e.responded_at), parseISO(e.created_at)) > 1440).map(toDetailItem); title = `SLA Breached (${items.length})`; break;
      default: return;
    }
    openDrillDown(title, items);
  }, [filtered, toDetailItem, openDrillDown]);

  const handleUrgencyClick = useCallback((urgencyLabel: string) => {
    const urgencyLower = urgencyLabel.toLowerCase();
    const items = filtered.filter(e => e.urgency === urgencyLower).map(toDetailItem);
    openDrillDown(`${urgencyLabel} Urgency Enquiries (${items.length})`, items);
  }, [filtered, toDetailItem, openDrillDown]);

  const handleMonthClick = useCallback((monthLabel: string) => {
    const monthEnquiries = enquiries.filter(e => {
      try {
        const d = parseISO(e.created_at);
        return format(d, 'MMM yy') === monthLabel;
      } catch { return false; }
    });
    const items = monthEnquiries.map(toDetailItem);
    openDrillDown(`Enquiries — ${monthLabel} (${items.length})`, items);
  }, [enquiries, toDetailItem, openDrillDown]);

  const handleDayClick = useCallback((dayLabel: string) => {
    const now = new Date();
    const dayEnquiries = Array.from({ length: 14 }, (_, i) => subDays(now, 13 - i))
      .filter(d => format(d, 'MMM d') === dayLabel)
      .flatMap(d => {
        const dateStr = format(d, 'yyyy-MM-dd');
        return enquiries.filter(e => e.created_at?.startsWith(dateStr));
      });
    const items = dayEnquiries.map(toDetailItem);
    openDrillDown(`Enquiries — ${dayLabel} (${items.length})`, items);
  }, [enquiries, toDetailItem, openDrillDown]);

  const handleLostReasonClick = useCallback((reason: string) => {
    const items = filtered.filter(e => e.status === 'order_lost' && (e.lost_reason || 'unknown').replace(/_/g, ' ') === reason).map(toDetailItem);
    openDrillDown(`Lost — ${reason} (${items.length})`, items);
  }, [filtered, toDetailItem, openDrillDown]);

  const handleSalesPersonDrillDown = useCallback((fullName: string) => {
    const items = filtered.filter(e => e.sales_person_name === fullName).map(toDetailItem);
    openDrillDown(`${fullName} — Enquiries (${items.length})`, items);
  }, [filtered, toDetailItem, openDrillDown]);

  const handleItemClick = useCallback((item: DetailItem) => {
    setDetailDialogOpen(false);
    setTimeout(() => {
      setSearchParams(prev => {
        const params = new URLSearchParams(prev);
        params.set('tab', 'enquiries');
        if (item.id) params.set('leadId', item.id);
        return params;
      });
    }, 150);
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

        <Select value={salesPersonFilter} onValueChange={setSalesPersonFilter}>
          <SelectTrigger className="w-[180px]">
            <Users className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="All Salespersons" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Salespersons</SelectItem>
            {salesPersons.map(sp => (
              <SelectItem key={sp} value={sp}>{sp}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="outline" className="ml-auto text-xs gap-1">
          <Activity className="w-3 h-3" />
          {TIME_LABELS[timeFilter]}
        </Badge>
      </div>

      {/* ============ TOP KPI CARDS ============ */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KPICard label="Total Enquiries" value={stats.total} icon={Package} gradient="from-indigo-500 to-blue-600" onClick={() => handleKPIClick('total')} />
        <KPICard label="Pending" value={stats.pendingCount} icon={Clock} gradient="from-amber-500 to-orange-600" subText={stats.pendingUrgent > 0 ? `${stats.pendingUrgent} urgent` : undefined} onClick={() => handleKPIClick('pending')} />
        <KPICard label="Hot Leads" value={stats.hotLeads} icon={Flame} gradient="from-red-500 to-orange-600" onClick={() => handleKPIClick('hot')} />
        <KPICard label="Mega Deals" value={stats.megaDeals} icon={Award} gradient="from-amber-500 to-yellow-600" onClick={() => handleKPIClick('mega')} />
        <KPICard label="Avg Response" value={stats.avgResponseTime} icon={Timer} gradient="from-purple-500 to-violet-600" subText={`${stats.respondedCount} responded`} isText onClick={() => handleKPIClick('total')} />
        <KPICard label="Conversion" value={`${stats.conversionRate}%`} icon={TrendingUp} gradient="from-green-500 to-emerald-600" isText onClick={() => handleKPIClick('won')} />
        <KPICard label="SLA Met" value={stats.slaMetCount} icon={CheckCircle2} gradient="from-emerald-500 to-green-600" subText={`${stats.slaBreachedCount} breached`} onClick={() => handleKPIClick('sla_met')} />
        <KPICard label="Win Rate" value={`${stats.winRate}%`} icon={Percent} gradient="from-teal-500 to-cyan-600" isText onClick={() => handleKPIClick('won')} />
      </div>

      {/* ============ WON / LOST SUMMARY ============ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          className="border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => handleKPIClick('won')}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-green-600" />
                Orders Won
                <Badge variant="secondary" className="text-xs">{stats.statusCounts['order_won'] || 0}</Badge>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {(stats.statusCounts['order_won'] || 0) > 0 ? (
              <div className="space-y-1">
                {filtered.filter(e => e.status === 'order_won').slice(0, 3).map(e => (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground truncate">{e.customer_name} — {e.product_name}</span>
                    <span className="font-medium text-green-700 dark:text-green-400 shrink-0">{e.sales_person_name.split(' ')[0]}</span>
                  </div>
                ))}
                {(stats.statusCounts['order_won'] || 0) > 3 && (
                  <p className="text-xs text-muted-foreground mt-1">+{(stats.statusCounts['order_won'] || 0) - 3} more</p>
                )}
              </div>
            ) : <p className="text-xs text-muted-foreground italic">No orders won in this period</p>}
          </CardContent>
        </Card>

        <Card
          className="border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => handleKPIClick('lost')}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-600" />
                Orders Lost
                <Badge variant="destructive" className="text-xs">{stats.statusCounts['order_lost'] || 0}</Badge>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {(stats.statusCounts['order_lost'] || 0) > 0 ? (
              <div className="space-y-1">
                {filtered.filter(e => e.status === 'order_lost').slice(0, 3).map(e => (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground truncate">{e.customer_name} — {e.lost_reason?.replace(/_/g, ' ') || 'N/A'}</span>
                    <span className="font-medium text-red-700 dark:text-red-400 shrink-0">{e.sales_person_name.split(' ')[0]}</span>
                  </div>
                ))}
                {(stats.statusCounts['order_lost'] || 0) > 3 && (
                  <p className="text-xs text-muted-foreground mt-1">+{(stats.statusCounts['order_lost'] || 0) - 3} more</p>
                )}
              </div>
            ) : <p className="text-xs text-muted-foreground italic">No orders lost in this period</p>}
          </CardContent>
        </Card>
      </div>

      {/* ============ CHARTS ROW 1 — Status & Temperature ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={statusPieData} cx="50%" cy="50%"
                  innerRadius={50} outerRadius={90} paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  style={{ cursor: 'pointer' }}
                  onClick={(_, idx) => { const d = statusPieData[idx]; if (d) handleStatusClick(d.name); }}
                >
                  {statusPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Temperature Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              Lead Temperature
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={temperatureData} cx="50%" cy="50%"
                  innerRadius={50} outerRadius={90} paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  style={{ cursor: 'pointer' }}
                  onClick={(_, idx) => { const d = temperatureData[idx]; if (d) handleTempClick(d.name); }}
                >
                  {temperatureData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Urgency Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Urgency Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                 <Pie
                   data={urgencyData} cx="50%" cy="50%"
                   innerRadius={50} outerRadius={90} paddingAngle={3}
                   dataKey="value"
                   label={({ name, value }) => `${name}: ${value}`}
                   style={{ cursor: 'pointer' }}
                   onClick={(_, idx) => { const d = urgencyData[idx]; if (d) handleUrgencyClick(d.name); }}
                 >
                  {urgencyData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ============ CHARTS ROW 2 — Category & Monthly Trend ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              Enquiries by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" fontSize={12} />
                <YAxis dataKey="name" type="category" fontSize={11} width={100} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="value" name="Enquiries" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}
                  style={{ cursor: 'pointer' }}
                  onClick={(data) => { if (data?.name) handleCategoryClick(data.name); }}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Monthly Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Monthly Enquiry Flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                 <Bar dataKey="total" name="Total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} style={{ cursor: 'pointer' }} onClick={(data) => { if (data?.month) handleMonthClick(data.month); }} />
                 <Bar dataKey="responded" name="Processed" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} style={{ cursor: 'pointer' }} onClick={(data) => { if (data?.month) handleMonthClick(data.month); }} />
                 <Bar dataKey="won" name="Won" fill="#22c55e" radius={[4, 4, 0, 0]} style={{ cursor: 'pointer' }} onClick={(data) => { if (data?.month) handleMonthClick(data.month); }} />
                 <Bar dataKey="lost" name="Lost" fill="#ef4444" radius={[4, 4, 0, 0]} style={{ cursor: 'pointer' }} onClick={(data) => { if (data?.month) handleMonthClick(data.month); }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ============ CHARTS ROW 3 — Daily Trend & Lost Reasons ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 14-Day Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              14-Day Enquiry Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
             <ResponsiveContainer width="100%" height={260}>
               <AreaChart data={dailyTrend} style={{ cursor: 'pointer' }} onClick={(e) => { if (e?.activeLabel) handleDayClick(e.activeLabel); }}>
                 <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                 <XAxis dataKey="date" fontSize={11} />
                 <YAxis fontSize={12} />
                 <Tooltip contentStyle={tooltipStyle} />
                 <Area type="monotone" dataKey="total" name="Total" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} />
                 <Area type="monotone" dataKey="responded" name="Responded" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Lost Reasons */}
        {lostReasonData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                Lost Reasons Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={lostReasonData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" fontSize={12} />
                  <YAxis dataKey="name" type="category" fontSize={11} width={100} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" name="Lost" fill="#ef4444" radius={[0, 4, 4, 0]} style={{ cursor: 'pointer' }} onClick={(data) => { if (data?.name) handleLostReasonClick(data.name); }} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ============ SALES PERSON PERFORMANCE ============ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Sales Person Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-2 font-medium">Sales Person</th>
                  <th className="text-center py-2 font-medium">Total</th>
                  <th className="text-center py-2 font-medium">Pending</th>
                  <th className="text-center py-2 font-medium">Won</th>
                  <th className="text-center py-2 font-medium">Lost</th>
                  <th className="text-center py-2 font-medium">Avg Response</th>
                </tr>
              </thead>
              <tbody>
                {salesPersonStats.map(sp => (
                   <tr key={sp.fullName} className="border-b border-border/30 hover:bg-muted/50 cursor-pointer"
                     onClick={() => handleSalesPersonDrillDown(sp.fullName)}
                   >
                    <td className="py-2 font-medium">{sp.fullName}</td>
                    <td className="text-center py-2">{sp.total}</td>
                    <td className="text-center py-2">
                      {sp.pending > 0 ? <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-700 border-amber-500/30">{sp.pending}</Badge> : '0'}
                    </td>
                    <td className="text-center py-2">
                      {sp.won > 0 ? <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 border-green-500/30">{sp.won}</Badge> : '0'}
                    </td>
                    <td className="text-center py-2">
                      {sp.lost > 0 ? <Badge variant="outline" className="text-xs bg-red-500/10 text-red-700 border-red-500/30">{sp.lost}</Badge> : '0'}
                    </td>
                    <td className="text-center py-2">{sp.avgHours > 0 ? `${sp.avgHours}h` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ============ FLOW SUMMARY ============ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Enquiry Flow Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {Object.entries(STATUS_CONFIG).map(([key, cfg], i, arr) => {
              const count = stats.statusCounts[key] || 0;
              return (
                <div key={key} className="flex items-center gap-2 cursor-pointer" onClick={() => handleStatusClick(cfg.label)}>
                  <div className="flex flex-col items-center">
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-lg transition-transform hover:scale-110"
                      style={{ backgroundColor: cfg.color }}
                    >
                      {count}
                    </div>
                    <span className="text-xs text-muted-foreground mt-1">{cfg.label}</span>
                  </div>
                  {i < arr.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground/50 mx-1" />}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ============ DRILL-DOWN DIALOG ============ */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              {dialogTitle}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-4">
              {dialogItems.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-8 text-center">No records found</p>
              ) : (
                dialogItems.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-background/80 px-4 py-3 text-sm cursor-pointer hover:bg-muted/50 transition-colors group"
                    onClick={() => handleItemClick(item)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{item.customer_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.product_name} • {item.customer_company} • Qty: {item.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {item.temperature && <LeadTemperatureBadge temperature={item.temperature as any} />}
                      <Badge variant="outline" className="text-xs capitalize">{item.status.replace(/_/g, ' ')}</Badge>
                      <span className="text-xs text-muted-foreground">{item.sales_person.split(' ')[0]}</span>
                      <span className="text-xs text-muted-foreground">{format(parseISO(item.date), 'MMM d')}</span>
                      <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
