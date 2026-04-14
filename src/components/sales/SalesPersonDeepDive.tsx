import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  Users, Target, Phone, MessageCircle, Mail, FileText, Send,
  ShoppingCart, TrendingUp, Sparkles, ThumbsUp, AlertTriangle,
  ArrowUpRight, Lightbulb, ChevronDown, ChevronUp, Activity,
  RefreshCw, CheckCircle2, XCircle, Clock, Star, CalendarCheck, PhoneOff,
} from 'lucide-react';

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

interface SalesPersonData {
  id: string;
  name: string;
  // Lead sources
  enquiries: number;
  enquiriesValue: number;
  interaktLeads: number;
  callLogs: number;
  callsAnswered: number;
  callsMissed: number;
  emailLeads: number;
  formLeads: number;
  // Conversions
  prospects: number;
  aCategory: number;
  pipelineCreated: number;
  pipelineValue: number;
  pipelineWon: number;
  pipelineWonValue: number;
  pipelineLost: number;
  pipelineActive: number;
  pipelineActiveValue: number;
  // Orders
  ordersWon: number;
  ordersValue: number;
  // Enquiry statuses
  enquiriesPending: number;
  enquiriesResponded: number;
  enquiriesMovedToPipeline: number;
  enquiriesWon: number;
  enquiriesLost: number;
  // Follow-up
  followUpsDue: number;
  followUpsCompleted: number;
  // Followups (from followups table)
  followupsTotal: number;
  followupsCompleted: number;
  followupsPending: number;
  followupsOverdue: number;
  // Callbacks
  callbacksTotal: number;
  callbacksCompleted: number;
  callbacksPending: number;
  // Target
  revenueTarget: number;
  ordersTarget: number;
}

interface Suggestion {
  type: 'strength' | 'warning' | 'action' | 'insight';
  text: string;
  priority: number;
}

function generateDeepSuggestions(sp: SalesPersonData, allSp: SalesPersonData[]): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const firstName = sp.name.split(' ')[0];
  const totalLeads = sp.enquiries + sp.interaktLeads + sp.callLogs + sp.emailLeads + sp.formLeads;

  // Team averages
  const avg = (fn: (s: SalesPersonData) => number) =>
    allSp.reduce((s, p) => s + fn(p), 0) / Math.max(allSp.length, 1);
  const avgLeads = avg(s => s.enquiries + s.interaktLeads + s.callLogs + s.emailLeads + s.formLeads);
  const avgProspects = avg(s => s.prospects);
  const avgOrders = avg(s => s.ordersWon);
  const avgRevenue = avg(s => s.ordersValue);
  const avgCalls = avg(s => s.callLogs);

  // Conversion rates
  const leadToProspect = totalLeads > 0 ? (sp.prospects / totalLeads) * 100 : 0;
  const prospectToPipeline = sp.prospects > 0 ? (sp.pipelineCreated / sp.prospects) * 100 : 0;
  const pipelineToWon = sp.pipelineCreated > 0 ? (sp.pipelineWon / sp.pipelineCreated) * 100 : 0;
  const enquiryResponseRate = sp.enquiries > 0 ? ((sp.enquiriesResponded + sp.enquiriesMovedToPipeline + sp.enquiriesWon) / sp.enquiries) * 100 : 0;

  // Follow-up rate
  const followUpRate = (sp.followUpsDue + sp.followUpsCompleted) > 0
    ? (sp.followUpsCompleted / (sp.followUpsDue + sp.followUpsCompleted)) * 100 : 0;

  // ===== STRENGTHS =====
  if (sp.ordersValue > avgRevenue * 1.3 && sp.ordersValue > 0) {
    suggestions.push({ type: 'strength', priority: 1, text: `🏆 Top performer! ${firstName}'s revenue (${formatCurrency(sp.ordersValue)}) is ${Math.round((sp.ordersValue / avgRevenue - 1) * 100)}% above team average.` });
  }
  if (sp.ordersWon > avgOrders * 1.5 && sp.ordersWon >= 3) {
    suggestions.push({ type: 'strength', priority: 2, text: `Strong closer with ${sp.ordersWon} orders won vs team avg of ${avgOrders.toFixed(1)}.` });
  }
  if (leadToProspect > 35 && totalLeads >= 5) {
    suggestions.push({ type: 'strength', priority: 3, text: `Excellent lead qualification — ${leadToProspect.toFixed(0)}% lead-to-prospect conversion rate.` });
  }
  if (sp.callsAnswered > 0 && sp.callLogs > 0 && (sp.callsAnswered / sp.callLogs) > 0.85) {
    suggestions.push({ type: 'strength', priority: 4, text: `High call answer rate (${Math.round((sp.callsAnswered / sp.callLogs) * 100)}%). ${firstName} is responsive to incoming calls.` });
  }
  if (enquiryResponseRate > 80 && sp.enquiries >= 5) {
    suggestions.push({ type: 'strength', priority: 3, text: `${Math.round(enquiryResponseRate)}% enquiry response rate — ${firstName} follows up on almost every enquiry.` });
  }
  if (sp.revenueTarget > 0 && (sp.ordersValue / sp.revenueTarget) >= 1) {
    suggestions.push({ type: 'strength', priority: 1, text: `🎯 Revenue target achieved! ${Math.round((sp.ordersValue / sp.revenueTarget) * 100)}% of target hit.` });
  }

  // ===== WARNINGS =====
  if (totalLeads > avgLeads * 0.8 && sp.ordersWon === 0 && totalLeads > 3) {
    suggestions.push({ type: 'warning', priority: 1, text: `${totalLeads} leads handled but zero orders closed. Review the full sales cycle — from qualification to closure.` });
  }
  if (totalLeads > 5 && leadToProspect < 15) {
    suggestions.push({ type: 'warning', priority: 2, text: `Low lead-to-prospect conversion (${leadToProspect.toFixed(0)}%). ${firstName} should focus on qualifying leads better — check if product/budget fit is assessed early.` });
  }
  if (sp.pipelineActiveValue > 0 && sp.pipelineWon === 0 && sp.pipelineActive > 2) {
    suggestions.push({ type: 'warning', priority: 2, text: `${sp.pipelineActive} active pipeline deals (${formatCurrency(sp.pipelineActiveValue)}) with no closures yet. Review deal stages for bottlenecks.` });
  }
  if (sp.callsMissed > sp.callsAnswered && sp.callLogs > 3) {
    suggestions.push({ type: 'warning', priority: 3, text: `More calls missed (${sp.callsMissed}) than answered (${sp.callsAnswered}). ${firstName} should improve availability during business hours.` });
  }
  if (followUpRate < 50 && (sp.followUpsDue + sp.followUpsCompleted) > 2) {
    suggestions.push({ type: 'warning', priority: 2, text: `Follow-up completion rate is only ${followUpRate.toFixed(0)}%. ${firstName} has ${sp.followUpsDue} pending follow-ups. Timely follow-ups can increase conversions by 20-30%.` });
  }
  if (sp.enquiriesPending > sp.enquiries * 0.5 && sp.enquiries > 3) {
    suggestions.push({ type: 'warning', priority: 1, text: `${sp.enquiriesPending} of ${sp.enquiries} enquiries still pending — over 50% unactioned. Prioritize responding to pending enquiries.` });
  }
  if (sp.pipelineLost > sp.pipelineWon && sp.pipelineLost > 2) {
    suggestions.push({ type: 'warning', priority: 2, text: `More deals lost (${sp.pipelineLost}) than won (${sp.pipelineWon}). Analyze lost deal reasons — pricing? competition? product fit?` });
  }

  // ===== ACTIONS =====
  if (sp.prospects > 3 && sp.pipelineCreated === 0) {
    suggestions.push({ type: 'action', priority: 1, text: `${sp.prospects} qualified prospects not yet in pipeline. Push ${firstName} to send quotes and create pipeline entries for these prospects.` });
  }
  if (sp.interaktLeads > 5 && sp.prospects === 0) {
    suggestions.push({ type: 'action', priority: 3, text: `${sp.interaktLeads} Interakt leads with no conversions to prospects. Review WhatsApp conversations for potential opportunities.` });
  }
  if (sp.emailLeads > 3 && sp.prospects === 0) {
    suggestions.push({ type: 'action', priority: 3, text: `${sp.emailLeads} email leads not converted. Schedule time for ${firstName} to review and follow up on email enquiries.` });
  }
  if (sp.callLogs > avgCalls * 1.5 && sp.prospects < avgProspects * 0.5) {
    suggestions.push({ type: 'action', priority: 2, text: `High call volume (${sp.callLogs}) but low prospect conversion. ${firstName} should focus on qualifying callers rather than just handling calls.` });
  }
  if (sp.pipelineActiveValue > avgRevenue * 2 && sp.ordersWon < avgOrders) {
    suggestions.push({ type: 'action', priority: 1, text: `Large active pipeline (${formatCurrency(sp.pipelineActiveValue)}) with low closures. Schedule weekly deal review meetings to unblock stalled negotiations.` });
  }

  // ===== INSIGHTS =====
  if (sp.revenueTarget > 0) {
    const pct = Math.round((sp.ordersValue / sp.revenueTarget) * 100);
    if (pct >= 70 && pct < 100) {
      suggestions.push({ type: 'insight', priority: 2, text: `At ${pct}% of revenue target. ${firstName} needs ${formatCurrency(sp.revenueTarget - sp.ordersValue)} more to hit target. Focus on closing active pipeline deals.` });
    } else if (pct < 40 && sp.revenueTarget > 0) {
      suggestions.push({ type: 'insight', priority: 1, text: `Only ${pct}% of revenue target achieved. Requires immediate pipeline acceleration and management intervention.` });
    }
  }

  // Channel-specific insights
  const channels = [
    { name: 'Enquiries', count: sp.enquiries },
    { name: 'Interakt', count: sp.interaktLeads },
    { name: 'Calls', count: sp.callLogs },
    { name: 'Emails', count: sp.emailLeads },
    { name: 'Forms', count: sp.formLeads },
  ].filter(c => c.count > 0).sort((a, b) => b.count - a.count);

  if (channels.length > 1) {
    const topChannel = channels[0];
    const topPct = totalLeads > 0 ? Math.round((topChannel.count / totalLeads) * 100) : 0;
    if (topPct > 60) {
      suggestions.push({ type: 'insight', priority: 4, text: `${topPct}% of leads come from ${topChannel.name}. ${firstName} is heavily dependent on one channel — encourage diversification.` });
    }
  }

  if (totalLeads === 0 && sp.prospects === 0 && sp.ordersWon === 0) {
    suggestions.push({ type: 'action', priority: 0, text: `No activity recorded for ${firstName} in this period. Check if they need support, reassignment, or if data is missing.` });
  }

  return suggestions.sort((a, b) => a.priority - b.priority).slice(0, 6);
}

interface Props {
  salesTeam: { user_id: string; name: string }[];
  enquiries: any[];
  interaktLeads: any[];
  emailLeads: any[];
  callLogs: any[];
  formLeads: any[];
  pipelineOrders: any[];
  orders: any[];
  prospects: any[];
  targets: any[];
  followups: any[];
  callbacks: any[];
  isManager: boolean;
}

export function SalesPersonDeepDive({
  salesTeam, enquiries, interaktLeads, emailLeads, callLogs, formLeads,
  pipelineOrders, orders, prospects, targets, followups, callbacks, isManager,
}: Props) {
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);
  const [detailDialog, setDetailDialog] = useState<{ open: boolean; title: string; items: any[] }>({ open: false, title: '', items: [] });
  const [assignedDialog, setAssignedDialog] = useState<{ open: boolean; name: string; leads: { source: string; items: any[] }[] }>({ open: false, name: '', leads: [] });

  const openAssignedLeads = (sp: any, spName: string) => {
    const spEnquiries = enquiries.filter((e: any) => e.sales_person_id === sp);
    const spInterakt = interaktLeads.filter((l: any) => l.sales_person_id === sp);
    const spEmail = emailLeads.filter((e: any) => e.sales_person_id === sp);
    const spCalls = callLogs.filter((c: any) => c.sales_person_id === sp);
    const spForms = formLeads.filter((f: any) => f.sales_person_id === sp);
    setAssignedDialog({
      open: true,
      name: spName,
      leads: [
        { source: 'Enquiries', items: spEnquiries },
        { source: 'Interakt', items: spInterakt },
        { source: 'Email', items: spEmail },
        { source: 'MyOperator', items: spCalls },
        { source: 'Forms', items: spForms },
      ],
    });
  };

  const salesPersonData = useMemo(() => {
    if (!isManager || salesTeam.length === 0) return [];

    return salesTeam.map((sp: any) => {
      const spEnquiries = enquiries.filter((e: any) => e.sales_person_id === sp.user_id);
      const spInterakt = interaktLeads.filter((l: any) => l.sales_person_id === sp.user_id);
      const spEmail = emailLeads.filter((e: any) => e.sales_person_id === sp.user_id);
      const spCalls = callLogs.filter((c: any) => c.sales_person_id === sp.user_id);
      const spForms = formLeads.filter((f: any) => f.sales_person_id === sp.user_id);
      const spProspects = prospects.filter((p: any) => p.created_by === sp.user_id);
      const spPipeline = pipelineOrders.filter((p: any) => p.sales_person_id === sp.user_id);
      const spOrders = orders.filter((o: any) => o.sales_person_id === sp.user_id);

      // Call analysis
      const callsAnswered = spCalls.filter((c: any) => {
        const payload = c.raw_payload;
        if (!payload?._ld || !Array.isArray(payload._ld)) return c.call_status === 'answered';
        return (payload._ld as any[]).some((l: any) => l._ac === 'received');
      }).length;

      // Pipeline breakdown
      const pipelineWon = spPipeline.filter((p: any) => p.status === 'won');
      const pipelineLost = spPipeline.filter((p: any) => p.status === 'lost');
      const pipelineActive = spPipeline.filter((p: any) => p.status !== 'won' && p.status !== 'lost');

      // Follow-ups (from pipeline with expected_closure_date)
      const today = new Date();
      const followUpsDue = spPipeline.filter((p: any) => {
        if (!p.expected_closure_date || p.status === 'won' || p.status === 'lost') return false;
        return new Date(p.expected_closure_date) <= today;
      }).length;
      const followUpsCompleted = pipelineWon.length + pipelineLost.length;

      // Followups from followups table
      const spFollowups = followups.filter((f: any) => f.user_id === sp.user_id || f.created_by === sp.user_id);
      const spFollowupsCompleted = spFollowups.filter((f: any) => f.status === 'completed');
      const spFollowupsPending = spFollowups.filter((f: any) => f.status === 'pending');
      const spFollowupsOverdue = spFollowupsPending.filter((f: any) => new Date(f.followup_at) < today);

      // Callbacks
      const spCallbacks = callbacks.filter((c: any) => c.assigned_to === sp.user_id);
      const spCallbacksCompleted = spCallbacks.filter((c: any) => c.status === 'completed');
      const spCallbacksPending = spCallbacks.filter((c: any) => c.status === 'pending');

      // Target
      const target = targets.find((t: any) => t.user_id === sp.user_id);

      const data: SalesPersonData = {
        id: sp.user_id,
        name: sp.name,
        enquiries: spEnquiries.length,
        enquiriesValue: spEnquiries.reduce((s: number, e: any) => s + (e.quantity || 0), 0),
        interaktLeads: spInterakt.length,
        callLogs: spCalls.length,
        callsAnswered,
        callsMissed: spCalls.length - callsAnswered,
        emailLeads: spEmail.length,
        formLeads: spForms.length,
        prospects: spProspects.length,
        aCategory: spProspects.filter((p: any) => p.is_a_category).length,
        pipelineCreated: spPipeline.length,
        pipelineValue: spPipeline.reduce((s: number, p: any) => s + (p.expected_price || 0), 0),
        pipelineWon: pipelineWon.length,
        pipelineWonValue: pipelineWon.reduce((s: number, p: any) => s + (p.expected_price || 0), 0),
        pipelineLost: pipelineLost.length,
        pipelineActive: pipelineActive.length,
        pipelineActiveValue: pipelineActive.reduce((s: number, p: any) => s + (p.expected_price || 0), 0),
        ordersWon: spOrders.length,
        ordersValue: spOrders.reduce((s: number, o: any) => s + (o.total_sales_amount || 0), 0),
        enquiriesPending: spEnquiries.filter((e: any) => e.status === 'pending').length,
        enquiriesResponded: spEnquiries.filter((e: any) => e.status === 'responded').length,
        enquiriesMovedToPipeline: spEnquiries.filter((e: any) => e.status === 'moved_to_pipeline').length,
        enquiriesWon: spEnquiries.filter((e: any) => e.status === 'order_won').length,
        enquiriesLost: spEnquiries.filter((e: any) => e.status === 'order_lost').length,
        followUpsDue,
        followUpsCompleted,
        followupsTotal: spFollowups.length,
        followupsCompleted: spFollowupsCompleted.length,
        followupsPending: spFollowupsPending.length,
        followupsOverdue: spFollowupsOverdue.length,
        callbacksTotal: spCallbacks.length,
        callbacksCompleted: spCallbacksCompleted.length,
        callbacksPending: spCallbacksPending.length,
        revenueTarget: target?.revenue_target || 0,
        ordersTarget: target?.orders_target || 0,
      };
      return data;
    }).filter(sp => {
      if (sp.name?.toLowerCase().includes('test')) return false;
      return true;
    }).sort((a, b) => b.ordersValue - a.ordersValue);
  }, [salesTeam, enquiries, interaktLeads, emailLeads, callLogs, formLeads, pipelineOrders, orders, prospects, targets, followups, callbacks, isManager]);

  if (!isManager || salesPersonData.length === 0) return null;

  // Comparison bar chart data
  const comparisonData = salesPersonData.map(sp => ({
    name: sp.name.split(' ')[0],
    Enquiries: sp.enquiries,
    Calls: sp.callLogs,
    Interakt: sp.interaktLeads,
    Emails: sp.emailLeads,
    Prospects: sp.prospects,
    Pipeline: sp.pipelineCreated,
    Orders: sp.ordersWon,
  }));

  // Radar data for expanded person
  const getRadarData = (sp: SalesPersonData) => {
    const totalLeads = sp.enquiries + sp.interaktLeads + sp.callLogs + sp.emailLeads + sp.formLeads;
    const maxLeads = Math.max(...salesPersonData.map(s => s.enquiries + s.interaktLeads + s.callLogs + s.emailLeads + s.formLeads), 1);
    const maxProspects = Math.max(...salesPersonData.map(s => s.prospects), 1);
    const maxPipeline = Math.max(...salesPersonData.map(s => s.pipelineCreated), 1);
    const maxOrders = Math.max(...salesPersonData.map(s => s.ordersWon), 1);
    const maxRevenue = Math.max(...salesPersonData.map(s => s.ordersValue), 1);
    const maxFollowUp = Math.max(...salesPersonData.map(s => s.followUpsCompleted + s.followUpsDue), 1);

    return [
      { metric: 'Lead Gen', value: Math.round((totalLeads / maxLeads) * 100), fullMark: 100 },
      { metric: 'Qualification', value: Math.round((sp.prospects / maxProspects) * 100), fullMark: 100 },
      { metric: 'Pipeline', value: Math.round((sp.pipelineCreated / maxPipeline) * 100), fullMark: 100 },
      { metric: 'Closing', value: Math.round((sp.ordersWon / maxOrders) * 100), fullMark: 100 },
      { metric: 'Revenue', value: Math.round((sp.ordersValue / maxRevenue) * 100), fullMark: 100 },
      { metric: 'Follow-up', value: maxFollowUp > 0 ? Math.round(((sp.followUpsCompleted) / maxFollowUp) * 100) : 0, fullMark: 100 },
    ];
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Salesperson Deep Dive — Activity & Performance Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Comparison Chart */}
          <div className="mb-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="Enquiries" fill="hsl(var(--chart-1))" stackId="leads" />
                <Bar dataKey="Calls" fill="hsl(var(--chart-3))" stackId="leads" />
                <Bar dataKey="Interakt" fill="hsl(var(--chart-2))" stackId="leads" />
                <Bar dataKey="Emails" fill="hsl(var(--chart-4))" stackId="leads" />
                <Bar dataKey="Prospects" fill="hsl(var(--chart-5))" />
                <Bar dataKey="Orders" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Per-person expandable cards */}
          {salesPersonData.map(sp => {
            const totalLeads = sp.enquiries + sp.interaktLeads + sp.callLogs + sp.emailLeads + sp.formLeads;
            const leadToProspect = totalLeads > 0 ? (sp.prospects / totalLeads) * 100 : 0;
            const prospectToPipeline = sp.prospects > 0 ? (sp.pipelineCreated / sp.prospects) * 100 : 0;
            const pipelineWinRate = sp.pipelineCreated > 0 ? (sp.pipelineWon / sp.pipelineCreated) * 100 : 0;
            const expanded = expandedPerson === sp.id;
            const suggestions = generateDeepSuggestions(sp, salesPersonData);

            return (
              <div
                key={sp.id}
                className="rounded-xl border border-border/50 overflow-hidden transition-all"
              >
                {/* Summary Row */}
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedPerson(expanded ? null : sp.id)}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                    {sp.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{sp.name}</span>
                      {sp.revenueTarget > 0 && (
                        <Badge variant={sp.ordersValue >= sp.revenueTarget ? 'default' : sp.ordersValue >= sp.revenueTarget * 0.7 ? 'secondary' : 'destructive'} className="text-[10px]">
                          {Math.round((sp.ordersValue / sp.revenueTarget) * 100)}% of target
                        </Badge>
                      )}
                      {suggestions.filter(s => s.type === 'warning').length > 0 && (
                        <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                          {suggestions.filter(s => s.type === 'warning').length} alerts
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      <span>{totalLeads} leads</span>
                      <span>•</span>
                      <span>{sp.prospects} prospects</span>
                      <span>•</span>
                      <span>{sp.pipelineActive} pipeline ({formatCurrency(sp.pipelineActiveValue)})</span>
                      <span>•</span>
                      <span className="text-emerald-500 font-medium">{sp.ordersWon} orders ({formatCurrency(sp.ordersValue)})</span>
                      {(sp.followupsPending > 0 || sp.callbacksPending > 0) && (
                        <>
                          <span>•</span>
                          <span className="text-amber-500 font-medium">
                            {sp.followupsPending} follow-ups · {sp.callbacksPending} callbacks
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded Detail */}
                {expanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border/30">
                    {/* Lead Sources Grid */}
                    <div className="pt-4">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Lead Sources</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {[
                          { label: 'Enquiries', value: sp.enquiries, icon: Send, color: 'text-blue-500' },
                          { label: 'Interakt', value: sp.interaktLeads, icon: MessageCircle, color: 'text-green-500' },
                          { label: 'MyOperator', value: sp.callLogs, icon: Phone, color: 'text-orange-500', sub: `${sp.callsAnswered}✓ ${sp.callsMissed}✗` },
                          { label: 'Emails', value: sp.emailLeads, icon: Mail, color: 'text-purple-500' },
                          { label: 'Forms', value: sp.formLeads, icon: FileText, color: 'text-teal-500' },
                        ].map(src => (
                          <div key={src.label} className="p-3 rounded-lg bg-muted/40 text-center">
                            <src.icon className={`w-4 h-4 mx-auto mb-1 ${src.color}`} />
                            <p className="text-lg font-bold">{src.value}</p>
                            <p className="text-[10px] text-muted-foreground">{src.label}</p>
                            {src.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{src.sub}</p>}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Conversion Funnel */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Conversion Funnel</h4>
                      <div className="space-y-2">
                        {[
                          { label: 'Leads → Prospects', rate: leadToProspect, from: totalLeads, to: sp.prospects },
                          { label: 'Prospects → Pipeline', rate: prospectToPipeline, from: sp.prospects, to: sp.pipelineCreated },
                          { label: 'Pipeline → Won', rate: pipelineWinRate, from: sp.pipelineCreated, to: sp.pipelineWon },
                        ].map(step => (
                          <div key={step.label} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span>{step.label}</span>
                              <span className="font-medium">
                                {step.from} → {step.to}
                                <span className={`ml-2 text-xs ${step.rate >= 30 ? 'text-green-500' : step.rate >= 15 ? 'text-amber-500' : 'text-destructive'}`}>
                                  ({step.rate.toFixed(0)}%)
                                </span>
                              </span>
                            </div>
                            <Progress value={Math.min(100, step.rate)} className="h-1.5" />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Pipeline & Orders */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pipeline</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-1.5"><Activity className="w-3 h-3" /> Active</span>
                            <span className="font-medium">{sp.pipelineActive} ({formatCurrency(sp.pipelineActiveValue)})</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-green-500" /> Won</span>
                            <span className="font-medium text-green-500">{sp.pipelineWon} ({formatCurrency(sp.pipelineWonValue)})</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-1.5"><XCircle className="w-3 h-3 text-destructive" /> Lost</span>
                            <span className="font-medium text-destructive">{sp.pipelineLost}</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Enquiry Status</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-amber-500" /> Pending</span>
                            <span className="font-medium">{sp.enquiriesPending}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-1.5"><RefreshCw className="w-3 h-3 text-blue-500" /> Responded</span>
                            <span className="font-medium">{sp.enquiriesResponded}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-1.5"><TrendingUp className="w-3 h-3 text-purple-500" /> To Pipeline</span>
                            <span className="font-medium">{sp.enquiriesMovedToPipeline}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-green-500" /> Won</span>
                            <span className="font-medium text-green-500">{sp.enquiriesWon}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Follow-up + Orders + Radar */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Results</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 rounded-lg bg-emerald-500/10 text-center">
                            <ShoppingCart className="w-4 h-4 mx-auto mb-1 text-emerald-500" />
                            <p className="text-xl font-bold text-emerald-500">{sp.ordersWon}</p>
                            <p className="text-[10px] text-muted-foreground">Orders Closed</p>
                            <p className="text-xs font-semibold text-emerald-500">{formatCurrency(sp.ordersValue)}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-amber-500/10 text-center">
                            <RefreshCw className="w-4 h-4 mx-auto mb-1 text-amber-500" />
                            <p className="text-xl font-bold text-amber-500">{sp.followUpsDue}</p>
                            <p className="text-[10px] text-muted-foreground">Pipeline Due</p>
                            <p className="text-xs text-muted-foreground">{sp.followUpsCompleted} resolved</p>
                          </div>
                        </div>

                        {/* Follow-ups & Callbacks Section */}
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Follow-ups & Callbacks</h4>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="p-2.5 rounded-lg bg-primary/10 text-center">
                            <CalendarCheck className="w-3.5 h-3.5 mx-auto mb-1 text-primary" />
                            <p className="text-lg font-bold">{sp.followupsTotal}</p>
                            <p className="text-[9px] text-muted-foreground">Total Follow-ups</p>
                          </div>
                          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-center">
                            <CheckCircle2 className="w-3.5 h-3.5 mx-auto mb-1 text-emerald-500" />
                            <p className="text-lg font-bold text-emerald-500">{sp.followupsCompleted}</p>
                            <p className="text-[9px] text-muted-foreground">Completed</p>
                          </div>
                          <div className={`p-2.5 rounded-lg text-center ${sp.followupsOverdue > 0 ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
                            <AlertTriangle className={`w-3.5 h-3.5 mx-auto mb-1 ${sp.followupsOverdue > 0 ? 'text-red-500' : 'text-amber-500'}`} />
                            <p className={`text-lg font-bold ${sp.followupsOverdue > 0 ? 'text-red-500' : 'text-amber-500'}`}>{sp.followupsPending}</p>
                            <p className="text-[9px] text-muted-foreground">Pending ({sp.followupsOverdue} overdue)</p>
                          </div>
                        </div>
                        {sp.followupsTotal > 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Follow-up Completion Rate</span>
                              <span className="font-medium">{Math.round((sp.followupsCompleted / sp.followupsTotal) * 100)}%</span>
                            </div>
                            <Progress value={(sp.followupsCompleted / sp.followupsTotal) * 100} className="h-1.5" />
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-2">
                          <div className="p-2.5 rounded-lg bg-red-500/10 text-center">
                            <PhoneOff className="w-3.5 h-3.5 mx-auto mb-1 text-red-500" />
                            <p className="text-lg font-bold text-red-500">{sp.callbacksTotal}</p>
                            <p className="text-[9px] text-muted-foreground">Callbacks Assigned</p>
                          </div>
                          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-center">
                            <Phone className="w-3.5 h-3.5 mx-auto mb-1 text-emerald-500" />
                            <p className="text-lg font-bold text-emerald-500">{sp.callbacksCompleted}</p>
                            <p className="text-[9px] text-muted-foreground">Called Back</p>
                          </div>
                          <div className={`p-2.5 rounded-lg text-center ${sp.callbacksPending > 0 ? 'bg-red-500/10' : 'bg-muted/40'}`}>
                            <Clock className={`w-3.5 h-3.5 mx-auto mb-1 ${sp.callbacksPending > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
                            <p className={`text-lg font-bold ${sp.callbacksPending > 0 ? 'text-red-500' : ''}`}>{sp.callbacksPending}</p>
                            <p className="text-[9px] text-muted-foreground">Pending</p>
                          </div>
                        </div>
                        {sp.revenueTarget > 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Revenue Target</span>
                              <span className="font-medium">{formatCurrency(sp.ordersValue)} / {formatCurrency(sp.revenueTarget)}</span>
                            </div>
                            <Progress value={Math.min(100, (sp.ordersValue / sp.revenueTarget) * 100)} className="h-2" />
                          </div>
                        )}
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Performance Radar</h4>
                        <ResponsiveContainer width="100%" height={200}>
                          <RadarChart data={getRadarData(sp)} cx="50%" cy="50%" outerRadius="70%">
                            <PolarGrid className="stroke-muted" />
                            <PolarAngleAxis dataKey="metric" className="text-[10px]" />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
                            <Radar name={sp.name} dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* AI Suggestions */}
                    {suggestions.length > 0 && (
                      <div className="rounded-lg bg-muted/30 p-4 space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-primary" />
                          AI Coaching Suggestions
                        </h4>
                        <div className="space-y-2">
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
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}
