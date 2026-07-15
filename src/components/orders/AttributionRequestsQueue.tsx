import { useMemo, useState } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Inbox, Check, X, CheckCircle2, TrendingUp, Clock, Trophy } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  usePendingAttributionRequests,
  useAttributionMutations,
  useDecidedAttributionRequestsHistory,
  useAllAttributionHistory,
} from '@/hooks/useAttributionRequests';
import { ATTRIBUTION_REASONS } from './OrderAttributionPanel';
import { AttributionEvidenceList } from './AttributionEvidenceList';
import { toast } from '@/hooks/use-toast';

function reasonLabel(v?: string | null) {
  if (!v) return '—';
  return ATTRIBUTION_REASONS.find((r) => r.value === v)?.label ?? v;
}

export function AttributionRequestsQueue() {
  const { data, isLoading, refetch } = usePendingAttributionRequests();
  const { data: history, isLoading: historyLoading } = useDecidedAttributionRequestsHistory(200);
  const { data: allHistory, isLoading: allHistoryLoading } = useAllAttributionHistory(500);
  const { decide } = useAttributionMutations();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const PAGE_SIZE = 50;

  const analytics = useMemo(() => {
    const rows = history?.rows ?? [];
    const approved = rows.filter((r) => r.status === 'approved');
    const rejected = rows.filter((r) => r.status === 'rejected');
    const total = rows.length;
    const approvalRate = total ? Math.round((approved.length / total) * 100) : 0;

    // avg decision turnaround (hours)
    const durations = rows
      .map((r) => {
        if (!r.decided_at || !r.created_at) return null;
        return (new Date(r.decided_at).getTime() - new Date(r.created_at).getTime()) / 36e5;
      })
      .filter((n): n is number => n != null && isFinite(n) && n >= 0);
    const avgHours = durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    // credited amount from approved requests
    let creditedValue = 0;
    approved.forEach((r) => {
      const o = history?.orders.get(r.order_id);
      if (o?.total_sales_amount != null) creditedValue += Number(o.total_sales_amount);
    });

    // top requester (by approved count)
    const byRequester = new Map<string, { name: string; approved: number; total: number }>();
    rows.forEach((r) => {
      const name = r.requested_for_name ?? r.requested_by_name ?? 'Unknown';
      const cur = byRequester.get(name) ?? { name, approved: 0, total: 0 };
      cur.total += 1;
      if (r.status === 'approved') cur.approved += 1;
      byRequester.set(name, cur);
    });
    const topRequesters = Array.from(byRequester.values())
      .sort((a, b) => b.approved - a.approved || b.total - a.total)
      .slice(0, 5);

    return { total, approved: approved.length, rejected: rejected.length, approvalRate, avgHours, creditedValue, topRequesters };
  }, [history]);

  const logRows = allHistory?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(logRows.length / PAGE_SIZE));
  const currentPage = Math.min(historyPage, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = logRows.slice(pageStart, pageStart + PAGE_SIZE);

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
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> Approval rate</div>
            <div className="text-2xl font-semibold mt-1">{analytics.approvalRate}%</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{analytics.approved} approved · {analytics.rejected} rejected</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" /> Credited value</div>
            <div className="text-2xl font-semibold mt-1">₹{Math.round(analytics.creditedValue).toLocaleString('en-IN')}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">from approved requests</div>
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
                ? `${analytics.topRequesters[0].approved} approved / ${analytics.topRequesters[0].total} total`
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
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/80">
                    <TableHead className="font-bold text-foreground">Order</TableHead>
                    <TableHead className="font-bold text-foreground">Customer</TableHead>
                    <TableHead className="font-bold text-foreground text-right">Amount</TableHead>
                    <TableHead className="font-bold text-foreground">Attributed to</TableHead>
                    <TableHead className="font-bold text-foreground">Reason</TableHead>
                    <TableHead className="font-bold text-foreground">Source</TableHead>
                    <TableHead className="font-bold text-foreground">By</TableHead>
                    <TableHead className="font-bold text-foreground">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((r) => {
                    const o = allHistory?.orders.get(r.order_id);
                    const viaRequest = r.source === 'approved_request';
                    return (
                      <TableRow key={r.id}>
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
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, logRows.length)} of {logRows.length}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}

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