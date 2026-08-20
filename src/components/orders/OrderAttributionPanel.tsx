import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Award, UserPlus, Loader2, ArrowUp, ChevronDown, ChevronRight, Search, AlertCircle, Check, X, Inbox } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSalesUsers } from '@/hooks/useSalesUsers';
import { useCanAttributeWebsiteOrder } from '@/hooks/useCanAttributeWebsiteOrder';
import { ORIGIN_LABEL, originOf } from '@/lib/attributionHistory';
import {
  useInternalOrderForAttribution,
  useMyAttributionRequest,
  useAttributionMutations,
  useAttributionLog,
  usePendingAttributionRequestsForOrder,
  useDecidedAttributionRequestsForOrder,
  SYSTEM_USER_ID,
} from '@/hooks/useAttributionRequests';
import { toast } from '@/hooks/use-toast';
import { AttributionEvidencePicker } from './AttributionEvidencePicker';
import { LEAD_SOURCE_OPTIONS } from '@/components/LeadSourceBadge';
import { AttributionEvidenceList } from './AttributionEvidenceList';
import type { AttributionEvidence } from './attributionEvidence';

export const ATTRIBUTION_REASONS: { value: string; label: string }[] = [
  { value: 'remote_customer_paid_online', label: 'Remote customer — paid via website' },
  { value: 'customer_preferred_online', label: 'Customer preferred to order online' },
  { value: 'field_phone_sale_online', label: 'Field/phone sale completed online by rep' },
  { value: 'other', label: 'Other (specify)' },
];

function reasonLabel(value?: string | null) {
  if (!value) return '—';
  return ATTRIBUTION_REASONS.find((r) => r.value === value)?.label ?? value;
}

/** Reason notes are stored as `Lead source: X` or `Lead source: X — free text`. */
function splitReasonCustom(raw?: string | null): { leadSource: string; customReason: string } {
  const s = (raw || '').trim();
  const m = s.match(/^Lead source:\s*([^—]*)(?:—\s*([\s\S]*))?$/);
  if (!m) return { leadSource: '', customReason: s };
  return { leadSource: (m[1] || '').trim(), customReason: (m[2] || '').trim() };
}

interface Props {
  /** Internal orders.id (when known) */
  internalOrderId?: string | null;
  /** Woo external_id, used to look up the mirrored internal order */
  externalId?: string | null;
  /** True when the website order has reached paid/processing+ */
  isMirroredAndPaid?: boolean;
}

export function OrderAttributionPanel({
  internalOrderId,
  externalId,
  isMirroredAndPaid = true,
}: Props) {
  const { roles, user } = useAuth();
  const { data: order } = useInternalOrderForAttribution({ internalOrderId, externalId });
  const { data: myRequest } = useMyAttributionRequest(order?.id);
  const canAttribute = useCanAttributeWebsiteOrder();
  // Check the full roles list, not the single top-priority role: 'sales' is
  // the LOWEST priority, so any second role (marketing, it, …) would hide the
  // claim button from a rep even though the request RPC accepts them.
  const isSalesRep = roles.includes('sales');

  const [assignOpen, setAssignOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const isAttributed =
    !!order?.sales_attribution_locked && !!order?.sales_person_id && order?.sales_person_id !== SYSTEM_USER_ID;

  // Fetch the most recent attribution field-audit row so we can show
  // whether the last change came through the RPC, a direct edit, the
  // Woo sync, or a normalising trigger. Must be called unconditionally
  // to preserve hook order across renders.
  const { data: latestAudit } = useQuery({
    queryKey: ['attribution-field-audit-latest', order?.id],
    enabled: !!order?.id && isAttributed,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('attribution_field_audit')
        .select('source_path, created_at, actor_name, field_name')
        .eq('order_id', order!.id)
        .eq('field_name', 'sales_person_id')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data ?? null) as { source_path: string; created_at: string; actor_name: string | null } | null;
    },
  });

  if (!order && !isMirroredAndPaid) {
    return (
      <div className="p-3 rounded-lg border border-dashed bg-muted/30 text-xs text-muted-foreground">
        Salesperson attribution is available once this website order is paid/processing.
      </div>
    );
  }
  if (!order) {
    // Paid but no mirrored internal order yet (sync lag) — say so instead of
    // rendering nothing, so reps don't think the claim option is missing.
    return (
      <div className="p-3 rounded-lg border border-dashed bg-muted/30 text-xs text-muted-foreground">
        Salesperson attribution will appear once this order finishes syncing. If this
        persists, ask an admin to run "Sync from Website".
      </div>
    );
  }

  const sourcePathLabel = (sp?: string | null) => {
    switch (sp) {
      case 'rpc': return { label: 'via Attribution RPC', cls: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400' };
      case 'direct_edit': return { label: 'via Direct Edit', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400' };
      case 'trigger_normalize': return { label: 'via Guard Trigger', cls: 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-400' };
      case 'woo_sync': return { label: 'via WooCommerce Sync', cls: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400' };
      case 'reconcile': return { label: 'via Reconcile', cls: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-400' };
      case 'system': return { label: 'via System', cls: 'border-muted bg-muted/40 text-muted-foreground' };
      default: return null;
    }
  };

  return (
    <div className="p-4 rounded-lg border border-primary/20 bg-muted/40 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Sales attribution</span>
        </div>
        {isAttributed ? (
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <Badge
                variant="outline"
                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                title={`By ${order.attributed_by_name ?? 'manager'} on ${
                  order.attributed_at ? new Date(order.attributed_at).toLocaleString('en-IN') : ''
                }`}
              >
                Credited to {order.sales_person_name} · {reasonLabel(order.sales_attribution_reason)}
              </Badge>
              {latestAudit && sourcePathLabel(latestAudit.source_path) && (
                <Badge
                  variant="outline"
                  className={sourcePathLabel(latestAudit.source_path)!.cls}
                  title={`Source path: ${latestAudit.source_path}`}
                >
                  {sourcePathLabel(latestAudit.source_path)!.label}
                </Badge>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground">
              Credited by {order.attributed_by_name ?? 'system'}
              {order.attributed_at && (
                <> · {new Date(order.attributed_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</>
              )}
            </span>
          </div>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">Unattributed — WooCommerce (Vishal)</Badge>
        )}
      </div>

      {myRequest && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          Your request:
          <Badge
            variant="outline"
            className={
              myRequest.status === 'approved'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : myRequest.status === 'rejected'
                  ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
            }
          >
            {myRequest.status}
          </Badge>
          {myRequest.decision_note && (
            <span className="italic">— {myRequest.decision_note}</span>
          )}
        </div>
      )}

      {canAttribute && (
        <PendingRequestsForOrder orderId={order.id} />
      )}

      <div className="flex flex-wrap gap-2">
        {canAttribute && (
          <Button
            size="sm"
            variant="default"
            onClick={() => setAssignOpen(true)}
            className="gap-2"
            data-testid="assign-salesperson-btn"
          >
            <UserPlus className="h-4 w-4" />
            {isAttributed ? 'Re-assign salesperson' : 'Assign to salesperson'}
          </Button>
        )}
        {isSalesRep && !isAttributed && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRequestOpen(true)}
            disabled={myRequest?.status === 'pending'}
            className="gap-2"
          >
            <UserPlus className="h-4 w-4" />
            {myRequest?.status === 'pending' ? 'Request pending' : 'Request to claim this order'}
          </Button>
        )}
      </div>

      {canAttribute && order && (
        <AssignDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          orderId={order.id}
          currentSalesPersonId={order.sales_person_id}
        />
      )}
      {isSalesRep && order && user && (
        <RequestDialog
          open={requestOpen}
          onOpenChange={setRequestOpen}
          orderId={order.id}
        />
      )}

      <AttributionLogList orderId={order.id} />
    </div>
  );
}

function AttributionRequestAuditLog({ orderId }: { orderId: string }) {
  const { data, isLoading } = useDecidedAttributionRequestsForOrder(orderId);
  const [expanded, setExpanded] = useState(false);
  const INITIAL = 3;
  if (isLoading) return null;
  if (!data || data.length === 0) return null;
  const visible = expanded ? data : data.slice(0, INITIAL);
  const remaining = data.length - visible.length;
  return (
    <div className="pt-2 border-t border-border/60">
      <div className="text-xs font-medium text-muted-foreground mb-2">
        Request audit log ({data.length})
      </div>
      <ul className="space-y-1.5">
        {visible.map((r) => {
          const approved = r.status === 'approved';
          return (
            <li
              key={r.id}
              className="text-xs rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={
                      approved
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400'
                    }
                  >
                    {approved ? (
                      <Check className="h-3 w-3 mr-0.5" />
                    ) : (
                      <X className="h-3 w-3 mr-0.5" />
                    )}
                    {r.status}
                  </Badge>
                  <span className="font-medium">
                    {r.decided_by_name ?? 'Unknown reviewer'}
                  </span>
                </span>
                <span className="text-muted-foreground text-[11px]">
                  {r.decided_at
                    ? new Date(r.decided_at).toLocaleString('en-IN')
                    : '—'}
                </span>
              </div>
              <div className="text-muted-foreground">
                Requested by{' '}
                <span className="text-foreground font-medium">
                  {r.requested_for_name ?? r.requested_by_name ?? 'Unknown'}
                </span>
                {' · '}
                {reasonLabel(r.reason)}
                {r.reason_custom && (
                  <span className="italic"> — "{r.reason_custom}"</span>
                )}
              </div>
              {r.decision_note && (
                <div className="italic text-muted-foreground">
                  Note: {r.decision_note}
                </div>
              )}
              <AttributionEvidenceList evidence={r.evidence} />
            </li>
          );
        })}
      </ul>
      {remaining > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 mt-1 text-[11px]"
          onClick={() => setExpanded(true)}
        >
          Show {remaining} more
        </Button>
      )}
      {expanded && data.length > INITIAL && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 mt-1 text-[11px]"
          onClick={() => setExpanded(false)}
        >
          Show less
        </Button>
      )}
    </div>
  );
}

function AttributionLogList({ orderId }: { orderId: string }) {
  return <AttributionLogListInner orderId={orderId} />;
}

function PendingRequestsForOrder({ orderId }: { orderId: string }) {
  const { data: pending, isLoading } = usePendingAttributionRequestsForOrder(orderId);
  const { decide } = useAttributionMutations();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  if (isLoading || !pending || pending.length === 0) return null;

  const approve = async (id: string) => {
    try {
      await decide.mutateAsync({ requestId: id, approve: true });
      toast({ title: 'Request approved', description: 'Order credited to requester.' });
    } catch (e) {
      toast({
        title: 'Failed to approve',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const reject = async () => {
    if (!rejectId) return;
    if (!rejectNote.trim()) {
      toast({ title: 'Reason required', description: 'Add a short note.', variant: 'destructive' });
      return;
    }
    try {
      await decide.mutateAsync({ requestId: rejectId, approve: false, note: rejectNote.trim() });
      toast({ title: 'Request rejected' });
      setRejectId(null); setRejectNote('');
    } catch (e) {
      toast({
        title: 'Failed to reject',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-300">
        <Inbox className="h-3.5 w-3.5" />
        Pending attribution request{pending.length > 1 ? 's' : ''} ({pending.length})
      </div>
      <ul className="space-y-2">
        {pending.map((r) => (
          <li key={r.id} className="rounded bg-background/70 border border-border/60 p-2 text-xs space-y-1.5">
            <div>
              <span className="font-medium">{r.requested_for_name ?? r.requested_by_name ?? 'Unknown'}</span>
              <span className="text-muted-foreground"> · {reasonLabel(r.reason)}</span>
              {r.reason_custom && <span className="italic text-muted-foreground"> — "{r.reason_custom}"</span>}
            </div>
            <AttributionEvidenceList evidence={r.evidence} />
            <div className="flex gap-2">
              <Button size="sm" variant="default" className="h-7 gap-1.5" onClick={() => approve(r.id)} disabled={decide.isPending}>
                <Check className="h-3.5 w-3.5" /> Approve
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => { setRejectId(r.id); setRejectNote(''); }} disabled={decide.isPending}>
                <X className="h-3.5 w-3.5" /> Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={!!rejectId} onOpenChange={(b) => { if (!b) { setRejectId(null); setRejectNote(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject request</DialogTitle>
            <DialogDescription>Add a short note so the requester understands why.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Reason for rejection" rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRejectId(null); setRejectNote(''); }}>Cancel</Button>
            <Button variant="destructive" onClick={reject} disabled={decide.isPending}>
              {decide.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AttributionLogListInner({ orderId }: { orderId: string }) {
  const { data: log, isLoading } = useAttributionLog(orderId);
  const [expanded, setExpanded] = useState(false);
  const [openEntries, setOpenEntries] = useState<Record<string, boolean>>({});
  const listRef = useRef<HTMLUListElement>(null);
  const topRef = useRef<HTMLLIElement>(null);
  const INITIAL = 3;
  if (isLoading) return null;
  if (!log || log.length === 0) return null;
  const visible = expanded ? log : log.slice(0, INITIAL);
  const remaining = log.length - visible.length;
  const jumpToLatest = () => {
    if (!expanded) setExpanded(true);
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = 0;
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  return (
    <div className="pt-2 border-t border-border/60">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-muted-foreground">
          Attribution history ({log.length})
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] gap-1"
          onClick={jumpToLatest}
        >
          <ArrowUp className="h-3 w-3" />
          Jump to latest
        </Button>
      </div>
      <ul
        ref={listRef}
        className={`space-y-1.5 pr-1 ${expanded ? 'max-h-64 overflow-y-auto' : ''}`}
      >
        {visible.map((entry, idx) => {
          const isOpen = !!openEntries[entry.id];
          const hasDetails = !!(entry.reason || entry.reason_custom);
          return (
            <li
              key={entry.id}
              ref={idx === 0 ? topRef : undefined}
              className="text-xs rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5"
            >
              <button
                type="button"
                onClick={() =>
                  hasDetails &&
                  setOpenEntries((m) => ({ ...m, [entry.id]: !m[entry.id] }))
                }
                className={`w-full text-left ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
                aria-expanded={isOpen}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium flex items-center gap-1">
                    {hasDetails && (
                      isOpen
                        ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                    → {entry.to_sales_person_name}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {new Date(entry.created_at).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
                <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>by {entry.changed_by_name ?? 'system'}</span>
                  <Badge
                    variant="outline"
                    className={
                      entry.source === 'approved_request'
                        ? 'h-4 px-1 text-[10px] border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400'
                        : 'h-4 px-1 text-[10px] border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-400'
                    }
                  >
                    {entry.source === 'approved_request' ? 'approved request' : 'direct'}
                  </Badge>
                  <Badge variant="outline" className="h-4 px-1 text-[10px] text-muted-foreground">
                    {ORIGIN_LABEL[originOf(entry)]}
                  </Badge>
                  <span className="truncate max-w-[260px]">· {reasonLabel(entry.reason)}</span>
                  {entry.reason_custom && !isOpen && (
                    <span className="italic truncate max-w-[200px]">
                      — {entry.reason_custom}
                    </span>
                  )}
                </div>
              </button>
              {isOpen && hasDetails && (
                <div className="mt-2 pt-2 border-t border-border/40 space-y-1.5">
                  {entry.reason && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Reason
                      </div>
                      <div className="text-foreground whitespace-pre-wrap break-words">
                        {reasonLabel(entry.reason)}
                        <span className="text-muted-foreground"> ({entry.reason})</span>
                      </div>
                    </div>
                  )}
                  {entry.reason_custom && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Notes
                      </div>
                      <div className="text-foreground whitespace-pre-wrap break-words">
                        {entry.reason_custom}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <AttributionEvidenceList evidence={entry.evidence} />
            </li>
          );
        })}
      </ul>
      {log.length > INITIAL && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 mt-1.5 text-xs"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : `Show ${remaining} more`}
        </Button>
      )}
    </div>
  );
}

function ReasonFields({
  reason,
  setReason,
  customReason,
  setCustomReason,
  leadSource,
  setLeadSource,
}: {
  reason: string;
  setReason: (v: string) => void;
  customReason: string;
  setCustomReason: (v: string) => void;
  leadSource: string;
  setLeadSource: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Lead source</Label>
        <Select value={leadSource} onValueChange={setLeadSource}>
          <SelectTrigger><SelectValue placeholder="Select the lead source" /></SelectTrigger>
          <SelectContent className="max-h-64">
            {LEAD_SOURCE_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Reason</Label>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
          <SelectContent>
            {ATTRIBUTION_REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {reason === 'other' && (
        <div className="space-y-1.5">
          <Label>Please specify</Label>
          <Textarea
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder="Briefly explain why this order should be credited to this rep"
            rows={3}
          />
        </div>
      )}
    </div>
  );
}

function AssignDialog({
  open, onOpenChange, orderId, currentSalesPersonId,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  orderId: string;
  currentSalesPersonId: string | null;
}) {
  const { salesUsers, isLoading: loadingSales } = useSalesUsers();
  const { attribute } = useAttributionMutations();
  const [salesPersonId, setSalesPersonId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [evidence, setEvidence] = useState<AttributionEvidence[]>([]);
  const [query, setQuery] = useState('');

  // Same evidence bar as rep requests: a direct change by admin/sales_manager/
  // granted users still credits a deal, so it needs the same proof on record.
  const canSubmit =
    salesPersonId &&
    reason &&
    leadSource &&
    (reason !== 'other' || customReason.trim().length > 0) &&
    evidence.length > 0;

  const submit = async () => {
    try {
      const sourceNote = `Lead source: ${leadSource}`;
      await attribute.mutateAsync({
        orderId,
        salesPersonId,
        reason,
        reasonCustom: reason === 'other'
          ? `${sourceNote} — ${customReason.trim()}`
          : sourceNote,
        evidence,
      });
      toast({ title: 'Order attributed', description: 'Credit assigned to salesperson.' });
      onOpenChange(false);
      setSalesPersonId(''); setReason(''); setCustomReason(''); setLeadSource(''); setEvidence([]);
    } catch (e) {
      toast({
        title: 'Failed to assign',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // Filter out the SYSTEM user from the picker — only real sales/sales_manager
  const pickable = useMemo(
    () => salesUsers.filter(
      (u) => u.user_id !== SYSTEM_USER_ID && (u.role === 'sales' || u.role === 'sales_manager'),
    ),
    [salesUsers],
  );
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q
      ? pickable.filter((u) =>
          (u.name || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q))
      : pickable),
    [pickable, q],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Assign salesperson</DialogTitle>
          <DialogDescription>
            Credit this website order to a salesperson. They will get the same points a normal order earns.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1 -mr-1">
          <div className="space-y-1.5">
            <Label>Salesperson</Label>
            <Select value={salesPersonId} onValueChange={setSalesPersonId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingSales ? 'Loading…' : 'Pick a salesperson'} />
              </SelectTrigger>
              <SelectContent>
                <div
                  className="sticky top-0 z-10 bg-popover border-b p-2"
                  onKeyDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name or email…"
                      className="h-8 pl-7 text-xs"
                    />
                  </div>
                </div>
                {filtered.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                    {pickable.length === 0
                      ? 'No salespeople available.'
                      : `No match for "${query}"`}
                  </div>
                ) : (
                  filtered.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.name}
                      {u.email ? <span className="text-muted-foreground"> · {u.email}</span> : null}
                      {currentSalesPersonId === u.user_id ? ' (current)' : ''}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {!loadingSales && pickable.length === 0 && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-300">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <div className="font-medium">Salesperson list is empty.</div>
                  <div>
                    Ask an admin to confirm your account has the <b>supply_chain</b>,{' '}
                    <b>sales_manager</b>, or <b>admin</b> role, and that the sales team profiles
                    are marked approved. Refresh the page after any change.
                  </div>
                </div>
              </div>
            )}
          </div>
          <ReasonFields
            reason={reason} setReason={setReason}
            customReason={customReason} setCustomReason={setCustomReason}
            leadSource={leadSource} setLeadSource={setLeadSource}
          />
          <AttributionEvidencePicker
            orderId={orderId}
            value={evidence}
            onChange={setEvidence}
            salesPersonId={salesPersonId || null}
          />
        </div>
        <DialogFooter className="shrink-0 border-t pt-3 mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || attribute.isPending}>
            {attribute.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestDialog({
  open, onOpenChange, orderId,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  orderId: string;
}) {
  const { requestAttribution } = useAttributionMutations();
  const { user } = useAuth(); // requests credit the requester themselves
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [evidence, setEvidence] = useState<AttributionEvidence[]>([]);

  // Evidence is mandatory — approvers won't credit a deal without proof, and
  // the RPC rejects an empty evidence array server-side.
  const canSubmit =
    reason &&
    leadSource &&
    (reason !== 'other' || customReason.trim().length > 0) &&
    evidence.length > 0;

  const submit = async () => {
    try {
      const sourceNote = `Lead source: ${leadSource}`;
      await requestAttribution.mutateAsync({
        orderId,
        reason,
        reasonCustom: reason === 'other'
          ? `${sourceNote} — ${customReason.trim()}`
          : sourceNote,
        evidence,
      });
      toast({
        title: 'Request submitted',
        description: 'Your request was sent to admins/sales managers.',
      });
      onOpenChange(false);
      setReason(''); setCustomReason(''); setLeadSource(''); setEvidence([]);
    } catch (e) {
      toast({
        title: 'Failed to send request',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Request to claim this order</DialogTitle>
          <DialogDescription>
            Tell your manager why this website order should be credited to you, and attach proof
            you closed the deal. They will approve or reject.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1 -mr-1">
          <ReasonFields
            reason={reason} setReason={setReason}
            customReason={customReason} setCustomReason={setCustomReason}
            leadSource={leadSource} setLeadSource={setLeadSource}
          />
          <AttributionEvidencePicker
            orderId={orderId}
            value={evidence}
            onChange={setEvidence}
            salesPersonId={user?.id ?? null}
          />
        </div>
        <DialogFooter className="shrink-0 border-t pt-3 mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || requestAttribution.isPending}>
            {requestAttribution.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}