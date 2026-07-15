import { useState } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Inbox, Check, X } from 'lucide-react';
import { usePendingAttributionRequests, useAttributionMutations } from '@/hooks/useAttributionRequests';
import { ATTRIBUTION_REASONS } from './OrderAttributionPanel';
import { AttributionEvidenceList } from './AttributionEvidenceList';
import { toast } from '@/hooks/use-toast';

function reasonLabel(v?: string | null) {
  if (!v) return '—';
  return ATTRIBUTION_REASONS.find((r) => r.value === v)?.label ?? v;
}

export function AttributionRequestsQueue() {
  const { data, isLoading, refetch } = usePendingAttributionRequests();
  const { decide } = useAttributionMutations();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

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