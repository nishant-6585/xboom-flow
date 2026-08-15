import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
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
  /** When provided, the funnel follows the page-level date filter and hides
   *  its own period Select (no duplicate timeline controls). */
  range?: { start: Date; end: Date } | null;
  rangeLabel?: string;
}

export function LeadFunnelTracker({ compact, range: externalRange, rangeLabel }: LeadFunnelTrackerProps) {
  const [period, setPeriod] = useState<Period>('today');
  const usesExternalRange = Boolean(externalRange);

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
        .select('id,created_at,order_status')
        .order('created_at', { ascending: false })
        .limit(1000);
      return (data as any[]) || [];
    },
  });

  const stats = useMemo(() => {
    const range = externalRange ?? getRange(period);

    // Count leads by source in period
    const interaktCount = (interaktLeads as any[]).filter(l => !l.is_enquiry_converted && inRange(l.created_at, range)).length;
    const myOpCount = callLogs.filter((l: any) => l.lead_source !== 'ElevenLabs' && !l.is_enquiry_converted && inRange(l.created_at, range)).length;
    const elevenCount = callLogs.filter((l: any) => l.lead_source === 'ElevenLabs' && !l.is_enquiry_converted && inRange(l.created_at, range)).length;
    const emailCount = (emailLeads as any[]).filter(l => !l.is_enquiry_converted && inRange(l.created_at, range)).length;
    const formCount = formLeads.filter(l => !(l as any).is_enquiry_converted && inRange(l.created_at, range)).length;
    const googleAdsCount = googleAdsLeads.filter(l => inRange(l.created_at, range)).length;
    const wooCount = (wooLeads as any[]).filter((l: any) => isWooLeadStatus(l.order_status) && inRange(l.created_at, range)).length;
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
        { name: 'Enquiries', count: enquiryCount, icon: Package },
        { name: 'Interakt', count: interaktCount, icon: MessageCircle },
        { name: 'MyOperator', count: myOpCount, icon: Phone },
        { name: 'ElevenLabs', count: elevenCount, icon: Bot },
        { name: 'Emails', count: emailCount, icon: Mail },
        { name: 'QForms', count: formCount, icon: FileText },
        { name: 'Google Ads', count: googleAdsCount, icon: Globe },
        { name: 'Abandoned Cart', count: wooCount, icon: Globe },
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
  }, [period, externalRange, enquiries, interaktLeads, emailLeads, callLogs, formLeads, googleAdsLeads, wooLeads, prospects, pipelineOrders]);

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
          {usesExternalRange ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {rangeLabel ?? 'Filtered'}
            </span>
          ) : (
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
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Funnel Steps — neutral, no connectors */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Leads', icon: Users, count: stats.totalLeads, value: null as string | null, rate: null as number | null },
            { label: 'Prospects', icon: Target, count: stats.prospectsCount, value: null, rate: stats.totalLeads > 0 ? stats.leadToProspectRate : null },
            { label: 'Pipeline', icon: TrendingUp, count: stats.pipelineCount, value: formatCurrency(stats.pipelineValue), rate: stats.prospectsCount > 0 ? stats.prospectToPipelineRate : null },
            { label: 'Won', icon: Package, count: stats.wonCount, value: formatCurrency(stats.wonValue), rate: stats.pipelineCount > 0 ? stats.pipelineToWonRate : null },
          ].map(step => (
            <div key={step.label} className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-medium">{step.label}</span>
                <step.icon className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{step.count}</div>
              {step.value && <div className="text-xs text-muted-foreground tabular-nums">{step.value}</div>}
              {step.rate !== null && (
                <Badge
                  variant="secondary"
                  className={cn('mt-2 text-[10px] tabular-nums', step.rate < 5 && 'text-destructive')}
                >
                  {step.rate.toFixed(1)}% conv.
                </Badge>
              )}
            </div>
          ))}
        </div>

        {/* Source Breakdown */}
        {!compact && (
          <div>
            <div className="text-sm font-medium mb-2 text-muted-foreground">
              {(usesExternalRange ? rangeLabel : PERIOD_LABELS[period]) ?? PERIOD_LABELS[period]} — Leads by Source
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {stats.sources.map(src => (
                <div key={src.name} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <src.icon className="w-4 h-4 text-muted-foreground shrink-0" />
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
