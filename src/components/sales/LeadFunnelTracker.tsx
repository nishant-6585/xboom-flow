import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useEnquiries } from '@/hooks/useEnquiries';
import { useInteraktLeads } from '@/hooks/useInteraktLeads';
import { useEmailLeads } from '@/hooks/useEmailLeads';
import { usePipelineOrders } from '@/hooks/usePipelineOrders';
import { useProspects } from '@/hooks/useProspects';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  Users, Target, TrendingUp, ArrowRight, CalendarDays,
  MessageCircle, Phone, Mail, FileText, Globe, Package, Bot,
} from 'lucide-react';
import { isWooLeadStatus } from '@/lib/wooOrderStatuses';
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  parseISO, isWithinInterval,
} from 'date-fns';

type Period = 'today' | 'this_week' | 'this_month';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  this_week: 'This Week',
  this_month: 'This Month',
};

function getRange(period: Period) {
  const now = new Date();
  switch (period) {
    case 'today': return { start: startOfDay(now), end: endOfDay(now) };
    case 'this_week': return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'this_month': return { start: startOfMonth(now), end: endOfMonth(now) };
  }
}

function inRange(dateStr: string | null | undefined, range: { start: Date; end: Date }): boolean {
  if (!dateStr) return false;
  try {
    return isWithinInterval(parseISO(dateStr), range);
  } catch {
    return false;
  }
}

interface LeadFunnelTrackerProps {
  compact?: boolean;
}

export function LeadFunnelTracker({ compact }: LeadFunnelTrackerProps) {
  const [period, setPeriod] = useState<Period>('today');

  const { enquiries } = useEnquiries();
  const { leads: interaktLeads } = useInteraktLeads();
  const { leads: emailLeads } = useEmailLeads();
  const { pipelineOrders } = usePipelineOrders();
  const { prospects } = useProspects();

  const { data: callLogs = [] } = useQuery({
    queryKey: ['funnel-call-logs'],
    queryFn: async () => {
      const { data } = await supabase.from('call_logs').select('id,created_at,lead_source,is_enquiry_converted').order('created_at', { ascending: false }).limit(1000);
      return data || [];
    },
  });

  const { data: formLeads = [] } = useQuery({
    queryKey: ['funnel-qforms-leads'],
    queryFn: async () => {
      const { data } = await supabase
        .from('leads' as any)
        .select('id,created_at,is_enquiry_converted')
        .order('created_at', { ascending: false })
        .limit(1000);
      return (data as any[]) || [];
    },
  });

  const { data: googleAdsLeads = [] } = useQuery({
    queryKey: ['funnel-google-ads-leads'],
    queryFn: async () => {
      const { data } = await supabase.from('google_ads_leads').select('id,created_at').order('created_at', { ascending: false }).limit(1000);
      return data || [];
    },
  });

  const { data: wooLeads = [] } = useQuery({
    queryKey: ['funnel-woo-leads'],
    queryFn: async () => {
      const { data } = await supabase
        .from('woocommerce_orders' as any)
        .select('id,created_at,status')
        .order('created_at', { ascending: false })
        .limit(1000);
      return (data as any[]) || [];
    },
  });

  const stats = useMemo(() => {
    const range = getRange(period);

    // Count leads by source in period
    const interaktCount = (interaktLeads as any[]).filter(l => !l.is_enquiry_converted && inRange(l.created_at, range)).length;
    const myOpCount = callLogs.filter((l: any) => l.lead_source !== 'ElevenLabs' && !l.is_enquiry_converted && inRange(l.created_at, range)).length;
    const elevenCount = callLogs.filter((l: any) => l.lead_source === 'ElevenLabs' && !l.is_enquiry_converted && inRange(l.created_at, range)).length;
    const emailCount = (emailLeads as any[]).filter(l => !l.is_enquiry_converted && inRange(l.created_at, range)).length;
    const formCount = formLeads.filter(l => !(l as any).is_enquiry_converted && inRange(l.created_at, range)).length;
    const googleAdsCount = googleAdsLeads.filter(l => inRange(l.created_at, range)).length;
    const wooCount = (wooLeads as any[]).filter((l: any) => isWooLeadStatus(l.status) && inRange(l.created_at, range)).length;
    const enquiryCount = enquiries.filter(e => inRange(e.created_at, range)).length;

    const totalLeads = interaktCount + myOpCount + elevenCount + emailCount + formCount + googleAdsCount + wooCount + enquiryCount;

    // Prospects created in period
    const prospectsCount = (prospects as any[]).filter(p => inRange(p.created_at, range)).length;

    // Pipeline created in period
    const pipelineCount = pipelineOrders.filter(p => inRange(p.created_at, range)).length;
    const pipelineValue = pipelineOrders
      .filter(p => inRange(p.created_at, range))
      .reduce((s, p) => s + (p.expected_price || 0), 0);

    // Pipeline won in period
    const wonCount = pipelineOrders.filter(p => p.status === 'won' && inRange(p.updated_at, range)).length;
    const wonValue = pipelineOrders
      .filter(p => p.status === 'won' && inRange(p.updated_at, range))
      .reduce((s, p) => s + (p.expected_price || 0), 0);

    const leadToProspectRate = totalLeads > 0 ? ((prospectsCount / totalLeads) * 100) : 0;
    const prospectToPipelineRate = prospectsCount > 0 ? ((pipelineCount / prospectsCount) * 100) : 0;
    const pipelineToWonRate = pipelineCount > 0 ? ((wonCount / pipelineCount) * 100) : 0;

    return {
      sources: [
        { name: 'Enquiries', count: enquiryCount, icon: Package, color: 'text-blue-600' },
        { name: 'Interakt', count: interaktCount, icon: MessageCircle, color: 'text-green-600' },
        { name: 'MyOperator', count: myOpCount, icon: Phone, color: 'text-purple-600' },
        { name: 'ElevenLabs', count: elevenCount, icon: Bot, color: 'text-violet-600' },
        { name: 'Emails', count: emailCount, icon: Mail, color: 'text-red-600' },
        { name: 'QForms', count: formCount, icon: FileText, color: 'text-orange-600' },
        { name: 'Google Ads', count: googleAdsCount, icon: Globe, color: 'text-cyan-600' },
        { name: 'Xboom Website', count: wooCount, icon: Globe, color: 'text-emerald-600' },
      ],
      totalLeads,
      prospectsCount,
      pipelineCount,
      pipelineValue,
      wonCount,
      wonValue,
      leadToProspectRate,
      prospectToPipelineRate,
      pipelineToWonRate,
    };
  }, [period, enquiries, interaktLeads, emailLeads, callLogs, formLeads, googleAdsLeads, wooLeads, prospects, pipelineOrders]);

  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
    return `₹${value.toFixed(0)}`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Lead → Prospect → Pipeline Funnel
          </CardTitle>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[140px]">
              <CalendarDays className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Funnel Steps */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Total Leads */}
          <div className="rounded-xl border bg-blue-50/50 dark:bg-blue-950/10 border-blue-200 dark:border-blue-800 p-4 text-center">
            <Users className="w-6 h-6 text-blue-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{stats.totalLeads}</div>
            <div className="text-xs text-muted-foreground font-medium">Total Leads</div>
          </div>

          {/* Arrow */}
          <div className="hidden md:flex items-center justify-center relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t-2 border-dashed border-muted-foreground/30" />
            </div>
            <div className="rounded-xl border bg-amber-50/50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-800 p-4 text-center relative z-10 w-full">
              <Target className="w-6 h-6 text-amber-600 mx-auto mb-1" />
              <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{stats.prospectsCount}</div>
              <div className="text-xs text-muted-foreground font-medium">Prospects</div>
              {stats.totalLeads > 0 && (
                <Badge variant="secondary" className="text-[10px] mt-1">{stats.leadToProspectRate.toFixed(0)}% conv.</Badge>
              )}
            </div>
          </div>

          {/* Mobile: Prospects */}
          <div className="md:hidden rounded-xl border bg-amber-50/50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-800 p-4 text-center">
            <Target className="w-6 h-6 text-amber-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{stats.prospectsCount}</div>
            <div className="text-xs text-muted-foreground font-medium">Prospects</div>
            {stats.totalLeads > 0 && (
              <Badge variant="secondary" className="text-[10px] mt-1">{stats.leadToProspectRate.toFixed(0)}% conv.</Badge>
            )}
          </div>

          {/* Pipeline */}
          <div className="hidden md:flex items-center justify-center relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t-2 border-dashed border-muted-foreground/30" />
            </div>
            <div className="rounded-xl border bg-purple-50/50 dark:bg-purple-950/10 border-purple-200 dark:border-purple-800 p-4 text-center relative z-10 w-full">
              <TrendingUp className="w-6 h-6 text-purple-600 mx-auto mb-1" />
              <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">{stats.pipelineCount}</div>
              <div className="text-xs text-muted-foreground font-medium">Pipeline</div>
              <div className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">{formatCurrency(stats.pipelineValue)}</div>
            </div>
          </div>

          <div className="md:hidden rounded-xl border bg-purple-50/50 dark:bg-purple-950/10 border-purple-200 dark:border-purple-800 p-4 text-center">
            <TrendingUp className="w-6 h-6 text-purple-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">{stats.pipelineCount}</div>
            <div className="text-xs text-muted-foreground font-medium">Pipeline</div>
            <div className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">{formatCurrency(stats.pipelineValue)}</div>
          </div>

          {/* Won */}
          <div className="rounded-xl border bg-green-50/50 dark:bg-green-950/10 border-green-200 dark:border-green-800 p-4 text-center">
            <Package className="w-6 h-6 text-green-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">{stats.wonCount}</div>
            <div className="text-xs text-muted-foreground font-medium">Won</div>
            <div className="text-[10px] text-green-600 dark:text-green-400 font-medium">{formatCurrency(stats.wonValue)}</div>
          </div>
        </div>

        {/* Conversion Bars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Lead → Prospect</span>
              <span className="font-semibold">{stats.leadToProspectRate.toFixed(1)}%</span>
            </div>
            <Progress value={Math.min(stats.leadToProspectRate, 100)} className="h-2" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Prospect → Pipeline</span>
              <span className="font-semibold">{stats.prospectToPipelineRate.toFixed(1)}%</span>
            </div>
            <Progress value={Math.min(stats.prospectToPipelineRate, 100)} className="h-2" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Pipeline → Won</span>
              <span className="font-semibold">{stats.pipelineToWonRate.toFixed(1)}%</span>
            </div>
            <Progress value={Math.min(stats.pipelineToWonRate, 100)} className="h-2" />
          </div>
        </div>

        {/* Source Breakdown */}
        {!compact && (
          <div>
            <div className="text-sm font-medium mb-2 text-muted-foreground">{PERIOD_LABELS[period]} — Leads by Source</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {stats.sources.map(src => (
                <div key={src.name} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <src.icon className={`w-4 h-4 ${src.color} shrink-0`} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{src.count}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{src.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
