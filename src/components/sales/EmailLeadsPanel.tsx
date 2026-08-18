import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DOMPurify from 'dompurify';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { LeadsExportMenu } from './LeadsExportMenu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useEmailLeads, useEmailLeadBody, MAIL_SOURCES, EmailLead } from '@/hooks/useEmailLeads';
import { useProspects } from '@/hooks/useProspects';
import { useAttentionItems } from '@/hooks/useAttentionItems';
import { useAuth } from '@/hooks/useAuth';
import { Search, Plus, Mail, Loader2, Filter, RefreshCw, Brain, CheckCircle, XCircle, AlertTriangle, Clock, TrendingUp, BarChart3, ChevronDown, ChevronRight, Eye, ArrowUpDown, Zap, Target, Inbox, ShieldCheck, Users, Layers } from 'lucide-react';
import { useGmailIntegration } from '@/hooks/useGmailIntegration';
import { format } from 'date-fns';
import { ProspectButton, ACategoryButton } from './ProspectButton';
import { AttentionButton } from './AttentionButton';
import { EnquiryConvertButton } from './EnquiryConvertButton';
import { ProspectAnalyticsCards } from './ProspectAnalyticsCards';
import { EmailLeadFormDialog } from './EmailLeadFormDialog';
import { EmailLeadDetailDrawer } from './EmailLeadDetailDrawer';
import { LeadContactDrawer, LeadContactData } from './LeadContactDrawer';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { GmailIntegrationCard } from './GmailIntegrationCard';
import { LinkToCompanyButton } from './LinkToCompanyButton';
import { LeadActionsCell } from './LeadActionsCell';
import { LeadAssigneeSelect } from './LeadAssigneeSelect';
import { DispositionBadge } from './DispositionBadge';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { touchedRowCn, isRowTouched } from '@/lib/touchedRow';
import { useEngagedLeadIds } from '@/hooks/useEngagedLeadIds';
import { applyDispositionFilter } from '@/lib/dispositionFilter';
import { groupDuplicates } from '@/lib/leadDeduplication';
import { DuplicateLeadsHistoryRow } from './DuplicateLeadsHistoryRow';

type SortField = 'created_at' | 'customer_name' | 'ai_confidence' | 'processing_status';
type SortDir = 'asc' | 'desc';

/** "about 3 hours ago" → "3h" — matches the All Inbox age column. */
function compactAge(iso: string): string {
  const raw = formatDistanceToNow(new Date(iso));
  const m = raw.match(/(\d+)\s*(minute|hour|day|month|year)/);
  if (!m) return raw.includes('less than') ? 'now' : raw;
  const unit = { minute: 'm', hour: 'h', day: 'd', month: 'mo', year: 'y' }[m[2]] ?? '';
  return `${m[1]}${unit}`;
}

interface EmailLeadsPanelProps {
  /** 'list' renders the table + Gmail card, 'analytics' renders the pipeline dashboard. */
  mode?: 'list' | 'analytics';
}

export function EmailLeadsPanel({ mode = 'list' }: EmailLeadsPanelProps = {}) {
  const { leads, loading, refetch, approveLead, approving, rejectLead, rejecting, metrics } = useEmailLeads();
  const { prospects } = useProspects();
  const { items: attentionItems } = useAttentionItems();
  const { role } = useAuth();
  const { data: engagedIds } = useEngagedLeadIds('email');
  const { processWithAI, isProcessingAI } = useGmailIntegration();
  const [search, setSearch] = useState('');
  const [mailSourceFilter, setMailSourceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [processingFilter, setProcessingFilter] = useState<string>('all');
  const [includeDispositioned, setIncludeDispositioned] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editLead, setEditLead] = useState<EmailLead | null>(null);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [detailLead, setDetailLead] = useState<EmailLead | null>(null);
  const [salespeople, setSalespeople] = useState<{ id: string; name: string }[]>([]);
  const [mergeDuplicates, setMergeDuplicates] = useState(true);
  const [expandedDupes, setExpandedDupes] = useState<Set<string>>(new Set());
  const { updateLead } = useEmailLeads();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const { data: detailBody } = useEmailLeadBody(detailLead?.id);

  useEffect(() => {
    supabase
      .from('employees')
      .select('id, name, user_id')
      .eq('is_active', true)
      .eq('department', 'Sales')
      .order('name')
      .then(async ({ data }) => {
        const { filterAllowedAssignees } = await import('@/lib/allowedAssignees');
        // Use user_id as the canonical id since email_leads.sales_person_id stores the auth user_id
        const mapped = (data || [])
          .filter((e: any) => e.user_id)
          .map((e: any) => ({ id: e.user_id as string, name: e.name as string }));
        setSalespeople(filterAllowedAssignees(mapped));
      });
  }, []);

  const filteredLeads = useMemo(() => {
    const filtered = leads.filter((lead) => {
      const matchesSearch = !search || 
        lead.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        lead.email?.toLowerCase().includes(search.toLowerCase()) ||
        lead.phone_number?.toLowerCase().includes(search.toLowerCase()) ||
        lead.product_name?.toLowerCase().includes(search.toLowerCase()) ||
        lead.customer_company?.toLowerCase().includes(search.toLowerCase());
      const matchesMail = mailSourceFilter === 'all' || (mailSourceFilter === 'gmail' ? lead.mail_source?.startsWith('gmail:') : lead.mail_source === mailSourceFilter);
      const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
      const matchesProcessing = processingFilter === 'all' || lead.processing_status === processingFilter;
      const matchesDate = (!startDate || new Date(lead.created_at) >= startDate) &&
        (!endDate || new Date(lead.created_at) <= endDate);
      return matchesSearch && matchesMail && matchesStatus && matchesProcessing && matchesDate;
    });

    const visible = applyDispositionFilter(filtered, includeDispositioned);
    return visible.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'customer_name':
          cmp = (a.customer_name || '').localeCompare(b.customer_name || '');
          break;
        case 'ai_confidence':
          cmp = (a.ai_confidence ?? -1) - (b.ai_confidence ?? -1);
          break;
        case 'processing_status':
          cmp = (a.processing_status || '').localeCompare(b.processing_status || '');
          break;
        default:
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [leads, search, mailSourceFilter, statusFilter, processingFilter, startDate, endDate, sortField, sortDir, includeDispositioned]);

  // Source breakdown
  const sourceBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => {
      const src = l.mail_source?.startsWith('gmail:') ? 'Gmail' : l.mail_source || 'Unknown';
      map[src] = (map[src] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [leads]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedLeads(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedLeads.size === filteredLeads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(filteredLeads.map(l => l.id)));
    }
  };

  const handleBulkApprove = async () => {
    const reviewLeads = filteredLeads.filter(l => selectedLeads.has(l.id) && l.processing_status === 'needs_review');
    if (reviewLeads.length === 0) {
      toast.error('No selected leads are in "needs_review" status');
      return;
    }
    for (const lead of reviewLeads) {
      try { await approveLead(lead.id); } catch {}
    }
    setSelectedLeads(new Set());
  };

  const handleBulkReject = async () => {
    const reviewLeads = filteredLeads.filter(l => selectedLeads.has(l.id) && l.processing_status === 'needs_review');
    if (reviewLeads.length === 0) {
      toast.error('No selected leads are in "needs_review" status');
      return;
    }
    for (const lead of reviewLeads) {
      try { await rejectLead(lead.id); } catch {}
    }
    setSelectedLeads(new Set());
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30';
      case 'responded': return 'bg-green-500/10 text-green-600 border-green-500/30';
      case 'on_hold': return 'bg-muted text-muted-foreground';
      case 'moved_to_pipeline': return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const processingStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30';
      case 'processing': return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
      case 'processed': return 'bg-green-500/10 text-green-600 border-green-500/30';
      case 'needs_review': return 'bg-orange-500/10 text-orange-600 border-orange-500/30';
      case 'rejected': return 'bg-muted text-muted-foreground';
      case 'failed': return 'bg-destructive/10 text-destructive border-destructive/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const processingStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-3 h-3" />;
      case 'processing': return <Loader2 className="w-3 h-3 animate-spin" />;
      case 'processed': return <CheckCircle className="w-3 h-3" />;
      case 'needs_review': return <Eye className="w-3 h-3" />;
      case 'rejected': return <XCircle className="w-3 h-3" />;
      case 'failed': return <AlertTriangle className="w-3 h-3" />;
      default: return null;
    }
  };

  const mailBadgeColor = (source: string) => {
    if (source?.startsWith('gmail:')) return 'bg-red-500/10 text-red-600 border-red-500/30';
    switch (source) {
      case 'hello@xboom.in': return 'bg-primary/10 text-primary border-primary/30';
      case 'contact@xboom.in': return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
      case 'sales@xboom.in': return 'bg-green-500/10 text-green-600 border-green-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const confidenceBar = (confidence: number | null) => {
    if (confidence == null) return <span className="text-xs text-muted-foreground">—</span>;
    const pct = Math.round(confidence * 100);
    const color = pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-orange-500' : 'bg-red-500';
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 min-w-[80px]">
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={`text-xs font-semibold tabular-nums ${
                pct >= 70 ? 'text-green-600' : pct >= 50 ? 'text-orange-600' : 'text-red-500'
              }`}>{pct}%</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">AI Confidence: {pct}%</p>
            <p className="text-xs text-muted-foreground">
              {pct >= 70 ? 'Auto-approved' : pct >= 50 ? 'Needs review' : 'Low confidence'}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const isProspect = (leadId: string) => prospects.some(p => p.source_id === leadId && p.source_type === 'email');
  const isAttention = (leadId: string) => attentionItems.some(a => a.source_id === leadId && a.source_type === 'email');

  const canManage = role === 'admin' || role === 'sales_manager';

  const getCleanPhone = (phone: string | null) => {
    if (!phone) return null;
    const match = phone.match(/(?:\+?\d[\d\s-]{7,}\d)|(?:\b\d{10,15}\b)/);
    return match ? match[0].replace(/[^\d+]/g, '') : null;
  };

  // Pipeline funnel
  const funnelStages = metrics ? [
    { label: 'Total', value: metrics.total, icon: Inbox, color: 'text-foreground' },
    { label: 'Pending', value: metrics.pending, icon: Clock, color: 'text-yellow-600' },
    { label: 'Processing', value: metrics.processing, icon: Zap, color: 'text-blue-600' },
    { label: 'Processed', value: metrics.processed, icon: CheckCircle, color: 'text-green-600' },
    { label: 'Review', value: metrics.needsReview, icon: Eye, color: 'text-orange-600' },
    { label: 'Rejected', value: metrics.rejected, icon: XCircle, color: 'text-muted-foreground' },
    { label: 'Failed', value: metrics.failed, icon: AlertTriangle, color: 'text-destructive' },
  ] : [];

  const needsReviewCount = metrics?.needsReview ?? 0;

  const dedupGroups = useMemo(() => {
    if (!mergeDuplicates) {
      return filteredLeads.map((l) => ({ primary: l, duplicates: [] as EmailLead[], count: 1, key: `single:${l.id}` }));
    }
    return groupDuplicates<EmailLead>(
      filteredLeads,
      (l) => ({ phone: l.phone_number, email: l.email, name: l.customer_name, company: l.customer_company }),
      (l) => l.created_at,
      (l) => l.id,
    );
  }, [filteredLeads, mergeDuplicates]);

  const mergedHiddenCount = useMemo(
    () => dedupGroups.reduce((acc, g) => acc + Math.max(0, g.count - 1), 0),
    [dedupGroups],
  );

  const totalPages = Math.max(1, Math.ceil(dedupGroups.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedGroups = useMemo(
    () => dedupGroups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [dedupGroups, currentPage],
  );

  // Reset to first page whenever the result set changes
  useEffect(() => {
    setPage(1);
  }, [search, mailSourceFilter, statusFilter, processingFilter, startDate, endDate, includeDispositioned, mergeDuplicates, sortField, sortDir]);

  const PaginationBar = ({ position }: { position: 'top' | 'bottom' }) => (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${position === 'top' ? 'pb-3' : 'pt-3'}`}>
      <p className="text-xs text-muted-foreground">
        Showing {dedupGroups.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
        {Math.min(currentPage * PAGE_SIZE, dedupGroups.length)} of {dedupGroups.length}
        {mergeDuplicates ? ' unique leads' : ' leads'}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage(1)} disabled={currentPage === 1}>
          First
        </Button>
        <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
          Prev
        </Button>
        <span className="text-xs px-2 tabular-nums">Page {currentPage} / {totalPages}</span>
        <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
          Next
        </Button>
        <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage(totalPages)} disabled={currentPage >= totalPages}>
          Last
        </Button>
      </div>
    </div>
  );

  const toggleDupeGroup = (key: string) => {
    setExpandedDupes((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  return (
    <div className="space-y-6">
      {mode === 'list' && <GmailIntegrationCard />}

      {/* Pipeline Funnel with visual flow */}
      {mode === 'analytics' && metrics && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-sm">Lead Pipeline</h3>
            <Badge variant="outline" className="ml-auto text-xs">
              Avg AI Confidence: {(metrics.avgConfidence * 100).toFixed(0)}%
            </Badge>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {funnelStages.map((stage, i) => {
              const Icon = stage.icon;
              const widthPct = metrics.total > 0 ? Math.max(15, (stage.value / metrics.total) * 100) : 0;
              return (
                <Card 
                  key={stage.label} 
                  className={`p-3 relative overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                    stage.label === 'Review' && needsReviewCount > 0 ? 'ring-2 ring-orange-500/50' : ''
                  }`}
                  onClick={() => {
                    const filterMap: Record<string, string> = {
                      'Total': 'all', 'Pending': 'pending', 'Processing': 'processing',
                      'Processed': 'processed', 'Review': 'needs_review', 'Rejected': 'rejected', 'Failed': 'failed'
                    };
                    setProcessingFilter(filterMap[stage.label] || 'all');
                  }}
                >
                  {/* Background bar */}
                  <div 
                    className="absolute bottom-0 left-0 h-1 bg-primary/20 transition-all" 
                    style={{ width: `${widthPct}%` }} 
                  />
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className={`w-3.5 h-3.5 ${stage.color}`} />
                    <span className="text-[11px] text-muted-foreground">{stage.label}</span>
                    {stage.label === 'Review' && needsReviewCount > 0 && (
                      <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] text-white font-bold animate-pulse">
                        {needsReviewCount}
                      </span>
                    )}
                  </div>
                  <div className={`text-xl font-bold ${stage.color}`}>{stage.value}</div>
                </Card>
              );
            })}
          </div>

          {/* Source Breakdown + AI Success Rate */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Source Breakdown</span>
              </div>
              <div className="space-y-2">
                {sourceBreakdown.map(([src, count]) => (
                  <div key={src} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-32 truncate">{src}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-primary/60 transition-all" 
                        style={{ width: `${leads.length > 0 ? (count / leads.length) * 100 : 0}%` }} 
                      />
                    </div>
                    <span className="text-xs font-semibold tabular-nums w-8 text-right">{count}</span>
                  </div>
                ))}
                {sourceBreakdown.length === 0 && (
                  <p className="text-xs text-muted-foreground">No data yet</p>
                )}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">AI Processing Health</span>
              </div>
              <div className="space-y-3">
                {metrics.total > 0 && (
                  <>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Success Rate</span>
                        <span className="font-medium text-green-600">
                          {Math.round((metrics.processed / Math.max(metrics.processed + metrics.failed, 1)) * 100)}%
                        </span>
                      </div>
                      <Progress 
                        value={(metrics.processed / Math.max(metrics.processed + metrics.failed, 1)) * 100} 
                        className="h-2"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Pipeline Throughput</span>
                        <span className="font-medium">
                          {Math.round(((metrics.processed + metrics.rejected) / metrics.total) * 100)}%
                        </span>
                      </div>
                      <Progress 
                        value={((metrics.processed + metrics.rejected) / metrics.total) * 100} 
                        className="h-2"
                      />
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground pt-1">
                      <span>✅ {metrics.processed} processed</span>
                      <span>⚠️ {metrics.failed} failed</span>
                      <span>🔄 {metrics.processing} in-flight</span>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {mode === 'analytics' && (
        <ProspectAnalyticsCards prospects={prospects} sourceType="email" />
      )}

      {mode === 'analytics' ? null : (
      <>
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              Email Leads
              <Badge variant="secondary" className="ml-2">
                {mergeDuplicates
                  ? `${dedupGroups.length} unique · ${mergedHiddenCount} merged · ${filteredLeads.length}`
                  : filteredLeads.length}
              </Badge>
              <Button
                size="sm"
                variant={mergeDuplicates ? "secondary" : "ghost"}
                className="h-7 px-2 gap-1 ml-1"
                onClick={() => setMergeDuplicates((v) => !v)}
                title="Merge duplicate leads (same phone / email / company+name)"
              >
                <Layers className="h-3.5 w-3.5" />
                {mergeDuplicates ? "Merged ✓" : "Merge Duplicates"}
              </Button>
              {needsReviewCount > 0 && (
                <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30 animate-pulse">
                  {needsReviewCount} needs review
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {selectedLeads.size > 0 && (
                <div className="flex items-center gap-1 border border-border rounded-lg px-2 py-1 bg-muted/30">
                  <span className="text-xs text-muted-foreground mr-1">{selectedLeads.size} selected</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedLeads(new Set())}>
                    Clear
                  </Button>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              <LeadsExportMenu
                rows={filteredLeads}
                filename="email-leads"
                title="Email Leads"
                columns={[
                  { label: 'Date', value: (l) => l.created_at, date: true },
                  { label: 'Customer', value: (l) => l.customer_name },
                  { label: 'Company', value: (l) => l.customer_company },
                  { label: 'Phone', value: (l) => l.phone_number },
                  { label: 'Email', value: (l) => l.email },
                  { label: 'City', value: (l) => l.city },
                  { label: 'Product', value: (l) => l.product_name },
                  { label: 'Category', value: (l) => l.product_category },
                  { label: 'Quantity', value: (l) => l.quantity },
                  { label: 'Mail Source', value: (l) => l.mail_source },
                  { label: 'Lead Source', value: (l) => l.lead_source },
                  { label: 'Subject', value: (l) => l.subject },
                  { label: 'Status', value: (l) => l.status },
                  { label: 'Processing', value: (l) => l.processing_status },
                  { label: 'Sales Person', value: (l) => l.sales_person_name },
                  { label: 'Notes', value: (l) => l.notes },
                ]}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => processWithAI(undefined)}
                disabled={isProcessingAI || !metrics?.pending}
                className={metrics?.pending ? 'text-primary border-primary/30' : ''}
                title={metrics?.pending ? `${metrics.pending} emails pending AI processing` : 'No pending emails to process'}
              >
                {isProcessingAI ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Brain className="w-4 h-4 mr-1" />}
                {metrics?.pending ? `AI Process (${metrics.pending})` : 'AI Process'}
              </Button>
              <Button size="sm" onClick={() => { setEditLead(null); setFormOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Add Email Lead
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search leads..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={mailSourceFilter} onValueChange={setMailSourceFilter}>
              <SelectTrigger className="w-[200px]">
                <Filter className="w-4 h-4 mr-1" />
                <SelectValue placeholder="Mail Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {MAIL_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                <SelectItem value="gmail">📧 Gmail</SelectItem>
              </SelectContent>
            </Select>
            <Select value={processingFilter} onValueChange={setProcessingFilter}>
              <SelectTrigger className="w-[180px]">
                <BarChart3 className="w-4 h-4 mr-1" />
                <SelectValue placeholder="Processing" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Processing</SelectItem>
                <SelectItem value="pending">⏳ Pending</SelectItem>
                <SelectItem value="processing">🔄 Processing</SelectItem>
                <SelectItem value="processed">✅ Processed</SelectItem>
                <SelectItem value="needs_review">🔍 Needs Review</SelectItem>
                <SelectItem value="rejected">❌ Rejected</SelectItem>
                <SelectItem value="failed">⚠️ Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="responded">Responded</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="moved_to_pipeline">Pipeline</SelectItem>
              </SelectContent>
            </Select>
            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              onClear={() => { setStartDate(undefined); setEndDate(undefined); }}
            />
            <div className="flex items-center gap-2 ml-auto">
              <Switch
                id="email-leads-show-all-dispositions"
                checked={includeDispositioned}
                onCheckedChange={setIncludeDispositioned}
              />
              <Label htmlFor="email-leads-show-all-dispositions" className="text-xs cursor-pointer">
                Show all dispositions
              </Label>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No email leads found</p>
            </div>
          ) : (
            <>
            <PaginationBar position="top" />
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 bg-background z-10">
                    <TableHead className="w-10">
                      <Checkbox 
                        checked={selectedLeads.size === filteredLeads.length && filteredLeads.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-[36px] px-2" />
                    <TableHead className="w-[110px]">Source</TableHead>
                    <TableHead>
                      <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort('customer_name')}>
                        Name
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Enquiry</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="w-[160px]">Assigned</TableHead>
                    <TableHead className="w-[80px] text-right">
                      <button className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors" onClick={() => toggleSort('created_at')}>
                        Age
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </TableHead>
                    <TableHead className="w-[150px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedGroups.map((group) => {
                    const lead = group.primary;
                    const dupCount = group.count;
                    const isMerged = dupCount > 1;
                    const dupeOpen = expandedDupes.has(group.key);
                    const isExpanded = expandedRows.has(lead.id);
                    const isSelected = selectedLeads.has(lead.id);
                    return (
                      <React.Fragment key={`g-${group.key}`}>
                        <TableRow 
                          key={lead.id} 
                          className={touchedRowCn(isRowTouched('emails', lead, engagedIds), `cursor-pointer transition-colors ${lead.processing_status === 'needs_review' ? 'ring-1 ring-orange-500/30' : ''} ${isSelected ? 'ring-1 ring-primary/40' : ''} ${isMerged ? 'border-l-2 border-l-amber-500/70 bg-amber-500/5' : ''}`)}
                          onClick={(e) => {
                            // Don't open drawer when clicking checkboxes, buttons, or expand toggles
                            const target = e.target as HTMLElement;
                            if (target.closest('button') || target.closest('[role="checkbox"]') || target.closest('a')) return;
                            setDetailLead(lead);
                          }}
                        >
                          <TableCell>
                            <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(lead.id)} />
                          </TableCell>
                          <TableCell className="py-2.5 px-2">
                            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold uppercase ${isRowTouched('emails', lead, engagedIds) ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                              {(lead.customer_name || '?').trim().charAt(0) || '?'}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <Badge variant="outline" className={`text-[10px] ${mailBadgeColor(lead.mail_source)}`}>
                              {lead.mail_source?.startsWith('gmail:') ? 'Gmail' : 'Email'}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className="text-[13px] font-medium flex items-center gap-1.5">
                              <span>{lead.customer_name || '—'}</span>
                              {isMerged && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); toggleDupeGroup(group.key); }}
                                  className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                                  title={`${dupCount} entries merged`}
                                >
                                  <Layers className="h-3 w-3" />×{dupCount}
                                </button>
                              )}
                            </div>
                            {lead.customer_company && (
                              <div className="text-xs text-muted-foreground truncate max-w-[200px]">{lead.customer_company}</div>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5 max-w-[260px]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {getCleanPhone(lead.phone_number) && (
                                <span className="font-mono text-[11.5px] whitespace-nowrap">{getCleanPhone(lead.phone_number)}</span>
                              )}
                              {getCleanPhone(lead.phone_number) && lead.email && <span className="text-muted-foreground">·</span>}
                              {lead.email && <span className="text-xs text-muted-foreground truncate">{lead.email}</span>}
                              {!getCleanPhone(lead.phone_number) && !lead.email && <span>—</span>}
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5 max-w-[320px]">
                            {(lead as any).subject || lead.product_name ? (
                              <>
                                <div className="text-[13px] truncate">{(lead as any).subject || lead.product_name}</div>
                                {(lead as any).subject && lead.product_name && (
                                  <div className="text-xs text-muted-foreground truncate">{lead.product_name}</div>
                                )}
                              </>
                            ) : (
                              <span className="text-[13px] text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5">
                            {lead.disposition && lead.disposition !== 'untouched' ? (
                              <DispositionBadge
                                disposition={lead.disposition as any}
                                reasonCode={lead.disposition_reason_code}
                                reasonNote={lead.disposition_reason_note}
                                dispositionAt={lead.disposition_at}
                                dispositionByName={lead.disposition_by_name}
                              />
                            ) : (
                              <Badge variant="outline" className="text-xs capitalize text-muted-foreground">
                                {lead.status ?? 'pending'}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5" onClick={(e) => e.stopPropagation()}>
                            <LeadAssigneeSelect
                              sourceTable="email_leads"
                              sourceRowId={lead.id}
                              assigneeId={lead.sales_person_id}
                              assigneeName={lead.sales_person_name}
                              onChanged={() => refetch()}
                            />
                          </TableCell>
                          <TableCell className="py-2.5 text-right">
                            <span className="font-mono text-[11.5px] text-muted-foreground" title={format(new Date(lead.created_at), 'dd MMM yyyy HH:mm')}>
                              {compactAge(lead.created_at)}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <LeadActionsCell
                                sourceType="email"
                                sourceId={lead.id}
                                customerName={lead.customer_name}
                                phone={lead.phone_number}
                                email={lead.email}
                                company={lead.customer_company}
                                city={lead.city}
                                productName={lead.product_name}
                                productCategory={lead.product_category}
                                productCode={lead.product_code}
                                quantity={lead.quantity}
                                urgency={lead.urgency}
                                requestedTimeline={lead.requested_timeline}
                                purposeOfPurchase={lead.purpose_of_purchase}
                                notes={lead.notes}
                                isAlreadyProspect={isProspect(lead.id)}
                                isAlreadyAttention={isAttention(lead.id)}
                                customerType={(lead as any).customer_type}
                                sourceLabel="Email"
                                currentDisposition={lead.disposition}
                                dispositionReasonCode={lead.disposition_reason_code}
                                dispositionReasonNote={lead.disposition_reason_note}
                                dispositionAt={lead.disposition_at}
                                dispositionByName={lead.disposition_by_name}
                                onDispositionChanged={() => refetch()}
                              />
                              <ACategoryButton sourceType="email" sourceId={lead.id} isACategory={lead.is_a_category} />
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expandable Detail Row */}
                        {isExpanded && (
                          <TableRow key={`${lead.id}-detail`} className="bg-muted/20 hover:bg-muted/30">
                            <TableCell colSpan={10} className="p-4">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                <div className="space-y-2">
                                  <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Lead Details</h4>
                                  <div className="space-y-1">
                                    {lead.lead_source && <p><span className="text-muted-foreground">Source:</span> {lead.lead_source}</p>}
                                    {lead.quantity && <p><span className="text-muted-foreground">Qty:</span> {lead.quantity}</p>}
                                    {lead.product_category && <p><span className="text-muted-foreground">Category:</span> {lead.product_category}</p>}
                                    {lead.product_code && <p><span className="text-muted-foreground">Code:</span> {lead.product_code}</p>}
                                    {lead.urgency && <p><span className="text-muted-foreground">Urgency:</span> <Badge variant="outline" className="text-[10px]">{lead.urgency}</Badge></p>}
                                    {lead.requested_timeline && <p><span className="text-muted-foreground">Timeline:</span> {lead.requested_timeline}</p>}
                                    {lead.purpose_of_purchase && <p><span className="text-muted-foreground">Purpose:</span> {lead.purpose_of_purchase}</p>}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Assignment & Notes</h4>
                                  <div className="space-y-1">
                                    {lead.sales_person_name && <p><span className="text-muted-foreground">Sales:</span> {lead.sales_person_name}</p>}
                                    {lead.created_by_name && <p><span className="text-muted-foreground">Created by:</span> {lead.created_by_name}</p>}
                                    {lead.notes && (
                                      <div>
                                        <span className="text-muted-foreground">Notes:</span>
                                        <p className="text-xs mt-0.5 bg-muted/50 rounded p-2 whitespace-pre-wrap">{lead.notes}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">AI Extraction</h4>
                                  {lead.ai_extracted_json ? (
                                    <pre className="text-[11px] bg-muted/50 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap font-mono">
                                      {JSON.stringify(lead.ai_extracted_json, null, 2)}
                                    </pre>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">No AI data extracted</p>
                                  )}
                                  {lead.error_message && (
                                    <div className="mt-2">
                                      <span className="text-xs text-destructive font-medium">Error:</span>
                                      <p className="text-xs text-destructive/80 bg-destructive/5 rounded p-2 mt-0.5">{lead.error_message}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        {isMerged && dupeOpen && (
                          <DuplicateLeadsHistoryRow
                            colSpan={10}
                            headerLabel={lead.email || getCleanPhone(lead.phone_number) || lead.customer_name || 'this contact'}
                            count={group.duplicates.length}
                            entries={group.duplicates.map((d) => ({
                              id: d.id,
                              createdAt: d.created_at,
                              name: d.customer_name,
                              phone: getCleanPhone(d.phone_number),
                              email: d.email,
                              company: d.customer_company,
                              product: d.product_name || (d as any).subject,
                              source: d.mail_source?.startsWith('gmail:') ? 'Gmail' : d.mail_source,
                              status: d.processing_status,
                              assignedTo: d.sales_person_name,
                            }))}
                            onSelect={(e) => {
                              const dup = group.duplicates.find((x) => x.id === e.id);
                              if (dup) setDetailLead(dup);
                            }}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <PaginationBar position="bottom" />
            </>
          )}
        </CardContent>
      </Card>

      <EmailLeadFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        lead={editLead}
        onSuccess={() => { setFormOpen(false); refetch(); }}
      />

      <LeadContactDrawer
        open={!!detailLead}
        onOpenChange={(open) => { if (!open) setDetailLead(null); }}
        lead={detailLead ? {
          id: detailLead.id,
          source_type: 'email',
          customer_name: detailLead.customer_name,
          phone: detailLead.phone_number,
          email: detailLead.email,
          company: detailLead.customer_company,
          city: detailLead.city,
          product_name: detailLead.product_name,
          notes: detailLead.notes,
          status: detailLead.status,
          assigned_to_name: detailLead.sales_person_name,
          created_at: detailLead.created_at,
          extras: {
            mail_source: detailLead.mail_source,
            product_category: detailLead.product_category,
            urgency: detailLead.urgency,
            ai_confidence: detailLead.ai_confidence != null ? `${Math.round(detailLead.ai_confidence * 100)}%` : null,
            processing_status: detailLead.processing_status,
          },
        } satisfies LeadContactData : null}
        extraContent={detailLead ? (
          <div className="space-y-3">
            {(detailLead as any).subject && (
              <div>
                <h4 className="text-sm font-semibold mb-1">Email Subject</h4>
                <p className="text-sm text-muted-foreground">{(detailLead as any).subject}</p>
              </div>
            )}
            {detailBody?.body_html ? (
              <div>
                <h4 className="text-sm font-semibold mb-1">Email Body</h4>
              <div className="text-sm border rounded p-3 max-h-[200px] overflow-auto bg-muted/30" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(detailBody.body_html) }} />
              </div>
            ) : detailBody?.body_text ? (
              <div>
                <h4 className="text-sm font-semibold mb-1">Email Body</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap max-h-[200px] overflow-auto">{detailBody.body_text}</p>
              </div>
            ) : null}
          </div>
        ) : undefined}
      />
      </>
      )}
    </div>
  );
}
