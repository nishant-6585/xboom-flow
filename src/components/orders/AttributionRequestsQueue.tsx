import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Inbox, Check, X, CheckCircle2, TrendingUp, Clock, Trophy, Search, Download, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  usePendingAttributionRequests,
  useAttributionMutations,
  useDecidedAttributionRequestsHistory,
  useAllAttributionHistory,
  type AttributionLogEntry,
  type AttributionRequest,
  type OrderAttribution,
} from '@/hooks/useAttributionRequests';
import { ATTRIBUTION_REASONS } from './OrderAttributionPanel';
import { AttributionEvidenceList } from './AttributionEvidenceList';
import { toast } from '@/hooks/use-toast';

function reasonLabel(v?: string | null) {
  if (!v) return '—';
  return ATTRIBUTION_REASONS.find((r) => r.value === v)?.label ?? v;
}

type SortColumn = 'order' | 'amount' | 'attributed_to' | 'when';
type SortDir = 'asc' | 'desc';
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Fetches the matching attribution request (if any) for a log entry. */
function useMatchingRequestForLog(log: AttributionLogEntry | null) {
  return useQuery({
    queryKey: ['attribution-request-for-log', log?.id],
    enabled: !!log && log.source === 'approved_request',
    queryFn: async (): Promise<AttributionRequest | null> => {
      if (!log) return null;
      const { data, error } = await supabase
        .from('sales_attribution_requests')
        .select('*')
        .eq('order_id', log.order_id)
        .eq('requested_for_sales_person_id', log.to_sales_person_id)
        .eq('status', 'approved')
        .order('decided_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as AttributionRequest | null;
    },
  });
}

export function AttributionRequestsQueue() {
  const { data, isLoading, refetch } = usePendingAttributionRequests();
  const { data: history, isLoading: historyLoading } = useDecidedAttributionRequestsHistory(200);
  const { data: allHistory, isLoading: allHistoryLoading } = useAllAttributionHistory(500);
  const { decide } = useAttributionMutations();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'direct' | 'approved_request'>('all');
  const [reviewerFilter, setReviewerFilter] = useState<string>('all');
  const [attributedToFilter, setAttributedToFilter] = useState<string>('all');
  const [sortCol, setSortCol] = useState<SortColumn>('when');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [detailsLog, setDetailsLog] = useState<AttributionLogEntry | null>(null);

  const analytics = useMemo(() => {
    const logs = allHistory?.rows ?? [];
    const orders = allHistory?.orders;
    const total = logs.length;
    const viaRequest = logs.filter((l) => l.source === 'approved_request').length;
    const direct = total - viaRequest;

    let creditedValue = 0;
    logs.forEach((l) => {
      const o = orders?.get(l.order_id);
      if (o?.total_sales_amount != null) creditedValue += Number(o.total_sales_amount);
    });

    const byRequester = new Map<string, { name: string; count: number }>();
    logs.forEach((l) => {
      const name = l.to_sales_person_name ?? 'Unknown';
      const cur = byRequester.get(name) ?? { name, count: 0 };
      cur.count += 1;
      byRequester.set(name, cur);
    });
    const topRequesters = Array.from(byRequester.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const reqRows = history?.rows ?? [];
    const durations = reqRows
      .map((r) => {
        if (!r.decided_at || !r.created_at) return null;
        return (new Date(r.decided_at).getTime() - new Date(r.created_at).getTime()) / 36e5;
      })
      .filter((n): n is number => n != null && isFinite(n) && n >= 0);
    const avgHours = durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return { total, viaRequest, direct, avgHours, creditedValue, topRequesters };
  }, [allHistory, history]);

  const logRows = allHistory?.rows ?? [];

  // Reviewer + Attributed-to option lists derived from data.
  const reviewerOptions = useMemo(() => {
    const s = new Set<string>();
    logRows.forEach((r) => { if (r.changed_by_name) s.add(r.changed_by_name); });
    return Array.from(s).sort();
  }, [logRows]);
  const attributedToOptions = useMemo(() => {
    const s = new Set<string>();
    logRows.forEach((r) => { if (r.to_sales_person_name) s.add(r.to_sales_person_name); });
    return Array.from(s).sort();
  }, [logRows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = logRows.filter((r) => {
      const o = allHistory?.orders.get(r.order_id);
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
      if (reviewerFilter !== 'all' && r.changed_by_name !== reviewerFilter) return false;
      if (attributedToFilter !== 'all' && r.to_sales_person_name !== attributedToFilter) return false;
      if (q) {
        const hay = [
          o?.customer_name,
          o?.order_number,
          o?.external_id,
          r.to_sales_person_name,
          r.changed_by_name,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      const oa = allHistory?.orders.get(a.order_id);
      const ob = allHistory?.orders.get(b.order_id);
      let va: string | number = 0;
      let vb: string | number = 0;
      switch (sortCol) {
        case 'order':
          va = (oa?.order_number ?? oa?.external_id ?? '').toString();
          vb = (ob?.order_number ?? ob?.external_id ?? '').toString();
          break;
        case 'amount':
          va = Number(oa?.total_sales_amount ?? 0);
          vb = Number(ob?.total_sales_amount ?? 0);
          break;
        case 'attributed_to':
          va = (a.to_sales_person_name ?? '').toLowerCase();
          vb = (b.to_sales_person_name ?? '').toLowerCase();
          break;
        case 'when':
        default:
          va = new Date(a.created_at).getTime();
          vb = new Date(b.created_at).getTime();
          break;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return sorted;
  }, [logRows, allHistory, search, sourceFilter, reviewerFilter, attributedToFilter, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(historyPage, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = filteredRows.slice(pageStart, pageStart + pageSize);

  const toggleSort = (col: SortColumn) => {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir(col === 'when' || col === 'amount' ? 'desc' : 'asc'); }
    setHistoryPage(1);
  };

  const resetPage = () => setHistoryPage(1);

  const exportCsv = () => {
    const header = ['Order', 'External ID', 'Customer', 'Amount', 'Attributed to', 'Reason', 'Reason note', 'Source', 'By', 'When'];
    const lines = [header.join(',')];
    filteredRows.forEach((r) => {
      const o = allHistory?.orders.get(r.order_id);
      lines.push([
        o?.order_number ?? '',
        o?.external_id ?? '',
        o?.customer_name ?? '',
        o?.total_sales_amount ?? '',
        r.to_sales_person_name ?? '',
        reasonLabel(r.reason),
        r.reason_custom ?? '',
        r.source === 'approved_request' ? 'via request' : 'direct',
        r.changed_by_name ?? '',
        r.created_at ? new Date(r.created_at).toISOString() : '',
      ].map(csvEscape).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attribution-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1 inline" />
      : <ArrowDown className="h-3 w-3 ml-1 inline" />;
  };

  const PaginationBar = () => (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 py-2">
      <span className="text-xs text-muted-foreground">
        {filteredRows.length === 0
          ? 'No matching rows'
          : `Showing ${pageStart + 1}–${Math.min(pageStart + pageSize, filteredRows.length)} of ${filteredRows.length}`}
        {filteredRows.length !== logRows.length && ` (filtered from ${logRows.length})`}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Rows</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => { setPageSize(Number(v)); setHistoryPage(1); }}
        >
          <SelectTrigger className="h-8 w-[72px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}>
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</span>
        <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}>
          Next
        </Button>
      </div>
    </div>
  );

  const handleApprove = async (id: string) => {
    try {
      await decide.mutateAsync({ requestId: id, approve: true });
      toast({ title: 'Request approved', description: 'Order credited to requester.' });
      refetch();
    } catch (e) {
      toast({
        title: 'Failed to approve',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleReject = async () => {
    if (!rejectId) return;
    if (!rejectNote.trim()) {
      toast({ title: 'Reason required', description: 'Please add a note for the rejection.', variant: 'destructive' });
      return;
    }
    try {
      await decide.mutateAsync({ requestId: rejectId, approve: false, note: rejectNote.trim() });
      toast({ title: 'Request rejected' });
      setRejectId(null); setRejectNote('');
      refetch();
    } catch (e) {
      toast({
        title: 'Failed to reject',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <TabsContent value="attribution_requests" className="space-y-4 mt-0">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10"><Inbox className="h-5 w-5 text-primary" /></div>
        <div>
          <h2 className="text-lg font-semibold">Attribution Requests</h2>
          <p className="text-xs text-muted-foreground">Sales reps requesting credit for website orders.</p>
        </div>
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> Total attributions</div>
            <div className="text-2xl font-semibold mt-1">{analytics.total}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{analytics.viaRequest} via request · {analytics.direct} direct</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" /> Credited value</div>
            <div className="text-2xl font-semibold mt-1">₹{Math.round(analytics.creditedValue).toLocaleString('en-IN')}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">from all attributions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Avg turnaround</div>
            <div className="text-2xl font-semibold mt-1">
              {analytics.avgHours < 1
                ? `${Math.round(analytics.avgHours * 60)}m`
                : analytics.avgHours < 48
                  ? `${analytics.avgHours.toFixed(1)}h`
                  : `${(analytics.avgHours / 24).toFixed(1)}d`}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">request → decision</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Trophy className="h-3.5 w-3.5" /> Top requester</div>
            <div className="text-lg font-semibold mt-1 truncate">{analytics.topRequesters[0]?.name ?? '—'}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {analytics.topRequesters[0]
                ? `${analytics.topRequesters[0].count} attributed orders`
                : 'no history yet'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending */}
      <div className="flex items-center justify-between pt-2">
        <h3 className="text-sm font-semibold text-foreground">Pending</h3>
        {data && data.rows.length > 0 && (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
            {data.rows.length} awaiting review
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !data || data.rows.length === 0 ? (
        <Card className="border-dashed bg-muted/20"><CardContent className="py-10 text-center text-sm text-muted-foreground">No pending requests.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {data.rows.map((r) => {
            const o = data.orders.get(r.order_id);
            return (
              <Card key={r.id}>
                <CardContent className="p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-mono font-semibold text-primary">#{o?.order_number ?? o?.external_id ?? '—'}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="font-medium">{o?.customer_name ?? '—'}</span>
                      {o?.total_sales_amount != null && (
                        <span className="text-muted-foreground">· ₹{Number(o.total_sales_amount).toLocaleString('en-IN')}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Requested by <span className="font-medium text-foreground">{r.requested_for_name ?? r.requested_by_name ?? 'Unknown'}</span>
                      {' · '}
                      {reasonLabel(r.reason)}
                      {r.reason_custom && <span className="italic"> — "{r.reason_custom}"</span>}
                    </div>
                    <AttributionEvidenceList
                      evidence={r.evidence}
                      orderAt={o?.order_date || o?.created_at || null}
                    />
                    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">pending</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="default" className="gap-1.5" onClick={() => handleApprove(r.id)} disabled={decide.isPending}>
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setRejectId(r.id); setRejectNote(''); }} disabled={decide.isPending}>
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* History */}
      <div className="flex items-center justify-between pt-4">
        <h3 className="text-sm font-semibold text-foreground">Decision history</h3>
        {logRows.length > 0 && (
          <span className="text-xs text-muted-foreground">Last {logRows.length} attributions</span>
        )}
      </div>
      {allHistoryLoading ? (
        <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : logRows.length === 0 ? (
        <Card className="border-dashed bg-muted/20"><CardContent className="py-8 text-center text-sm text-muted-foreground">No past attributions yet.</CardContent></Card>
      ) : (
        <>
          {/* Filters toolbar */}
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                placeholder="Search by customer or order #…"
                className="pl-7 h-9"
              />
            </div>
            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v as any); resetPage(); }}>
              <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="approved_request">Via request</SelectItem>
                <SelectItem value="direct">Direct</SelectItem>
              </SelectContent>
            </Select>
            <Select value={attributedToFilter} onValueChange={(v) => { setAttributedToFilter(v); resetPage(); }}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Attributed to" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All salespeople</SelectItem>
                {attributedToOptions.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={reviewerFilter} onValueChange={(v) => { setReviewerFilter(v); resetPage(); }}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Reviewer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reviewers</SelectItem>
                {reviewerOptions.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCsv} disabled={!filteredRows.length}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>

          <PaginationBar />

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/80">
                    <TableHead className="font-bold text-foreground cursor-pointer select-none" onClick={() => toggleSort('order')}>Order<SortIcon col="order" /></TableHead>
                    <TableHead className="font-bold text-foreground">Customer</TableHead>
                    <TableHead className="font-bold text-foreground text-right cursor-pointer select-none" onClick={() => toggleSort('amount')}>Amount<SortIcon col="amount" /></TableHead>
                    <TableHead className="font-bold text-foreground cursor-pointer select-none" onClick={() => toggleSort('attributed_to')}>Attributed to<SortIcon col="attributed_to" /></TableHead>
                    <TableHead className="font-bold text-foreground">Reason</TableHead>
                    <TableHead className="font-bold text-foreground">Source</TableHead>
                    <TableHead className="font-bold text-foreground">By</TableHead>
                    <TableHead className="font-bold text-foreground cursor-pointer select-none" onClick={() => toggleSort('when')}>When<SortIcon col="when" /></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                        No rows match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : pageRows.map((r) => {
                    const o = allHistory?.orders.get(r.order_id);
                    const viaRequest = r.source === 'approved_request';
                    return (
                      <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDetailsLog(r)}>
                        <TableCell className="font-mono font-semibold text-primary">
                          #{o?.order_number ?? o?.external_id ?? '—'}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate">{o?.customer_name ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {o?.total_sales_amount != null
                            ? `₹${Number(o.total_sales_amount).toLocaleString('en-IN')}`
                            : '—'}
                        </TableCell>
                        <TableCell>{r.to_sales_person_name ?? 'Unknown'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[220px]">
                          <div className="truncate">
                            {reasonLabel(r.reason)}
                            {r.reason_custom && <span className="italic"> — "{r.reason_custom}"</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {viaRequest ? 'via request' : 'direct'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{r.changed_by_name ?? '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          <PaginationBar />
        </>
      )}

      <AttributionDetailsSheet
        log={detailsLog}
        order={detailsLog ? allHistory?.orders.get(detailsLog.order_id) ?? null : null}
        onClose={() => setDetailsLog(null)}
      />

      <Dialog open={!!rejectId} onOpenChange={(b) => { if (!b) { setRejectId(null); setRejectNote(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject request</DialogTitle>
            <DialogDescription>Add a short note so the requester understands why.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Reason for rejection" rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRejectId(null); setRejectNote(''); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={decide.isPending}>
              {decide.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TabsContent>
  );
}

function AttributionDetailsSheet({
  log, order, onClose,
}: { log: AttributionLogEntry | null; order: OrderAttribution | null; onClose: () => void }) {
  const { data: matchedRequest, isLoading } = useMatchingRequestForLog(log);
  const open = !!log;
  return (
    <Sheet open={open} onOpenChange={(b) => { if (!b) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Attribution details</SheetTitle>
          <SheetDescription>
            {order ? `#${order.order_number ?? order.external_id ?? '—'} · ${order.customer_name ?? '—'}` : '—'}
          </SheetDescription>
        </SheetHeader>
        {log && (
          <div className="space-y-5 mt-4 text-sm">
            <section>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Attribution</h4>
              <dl className="grid grid-cols-3 gap-y-1.5 gap-x-3">
                <dt className="text-muted-foreground">Attributed to</dt>
                <dd className="col-span-2 font-medium">{log.to_sales_person_name ?? '—'}</dd>
                <dt className="text-muted-foreground">Source</dt>
                <dd className="col-span-2"><Badge variant="outline">{log.source === 'approved_request' ? 'via request' : 'direct'}</Badge></dd>
                <dt className="text-muted-foreground">Reason</dt>
                <dd className="col-span-2">{reasonLabel(log.reason)}</dd>
                {log.reason_custom && (<>
                  <dt className="text-muted-foreground">Note</dt>
                  <dd className="col-span-2 italic">"{log.reason_custom}"</dd>
                </>)}
                <dt className="text-muted-foreground">By</dt>
                <dd className="col-span-2">{log.changed_by_name ?? '—'}</dd>
                <dt className="text-muted-foreground">When</dt>
                <dd className="col-span-2">{new Date(log.created_at).toLocaleString('en-IN')}</dd>
                {order?.total_sales_amount != null && (<>
                  <dt className="text-muted-foreground">Order amount</dt>
                  <dd className="col-span-2 tabular-nums">₹{Number(order.total_sales_amount).toLocaleString('en-IN')}</dd>
                </>)}
              </dl>
            </section>

            {log.source === 'approved_request' && (
              <section>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Request &amp; decision</h4>
                {isLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading request…
                  </div>
                ) : matchedRequest ? (
                  <dl className="grid grid-cols-3 gap-y-1.5 gap-x-3">
                    <dt className="text-muted-foreground">Requested by</dt>
                    <dd className="col-span-2">{matchedRequest.requested_by_name ?? '—'}</dd>
                    <dt className="text-muted-foreground">Requested for</dt>
                    <dd className="col-span-2">{matchedRequest.requested_for_name ?? '—'}</dd>
                    <dt className="text-muted-foreground">Requested at</dt>
                    <dd className="col-span-2">{new Date(matchedRequest.created_at).toLocaleString('en-IN')}</dd>
                    <dt className="text-muted-foreground">Decided by</dt>
                    <dd className="col-span-2">{matchedRequest.decided_by_name ?? '—'}</dd>
                    <dt className="text-muted-foreground">Decided at</dt>
                    <dd className="col-span-2">{matchedRequest.decided_at ? new Date(matchedRequest.decided_at).toLocaleString('en-IN') : '—'}</dd>
                    {matchedRequest.decision_note && (<>
                      <dt className="text-muted-foreground">Reviewer note</dt>
                      <dd className="col-span-2 italic">"{matchedRequest.decision_note}"</dd>
                    </>)}
                  </dl>
                ) : (
                  <p className="text-xs text-muted-foreground">Matching request not found.</p>
                )}
                {matchedRequest?.evidence != null && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Evidence</div>
                    <AttributionEvidenceList
                      evidence={matchedRequest.evidence}
                      orderAt={order?.order_date || order?.created_at || null}
                    />
                  </div>
                )}
              </section>
            )}

            <section>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Raw payload</h4>
              <pre className="text-[11px] bg-muted/40 rounded p-2 overflow-auto max-h-[240px]">
{JSON.stringify({ log, request: matchedRequest ?? null }, null, 2)}
              </pre>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}