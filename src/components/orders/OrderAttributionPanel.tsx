import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Award, UserPlus, Loader2, ArrowUp, ChevronDown, ChevronRight, Search, AlertCircle, Check, X, Inbox } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSalesUsers } from '@/hooks/useSalesUsers';
import { useCanAttributeWebsiteOrder } from '@/hooks/useCanAttributeWebsiteOrder';
import {
  useInternalOrderForAttribution,
  useMyAttributionRequest,
  useAttributionMutations,
  useAttributionLog,
  usePendingAttributionRequestsForOrder,
  SYSTEM_USER_ID,
} from '@/hooks/useAttributionRequests';
import { toast } from '@/hooks/use-toast';

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
  const { role, user } = useAuth();
  const { data: order } = useInternalOrderForAttribution({ internalOrderId, externalId });
  const { data: myRequest } = useMyAttributionRequest(order?.id);
  const canAttribute = useCanAttributeWebsiteOrder();
  const isSalesRep = role === 'sales';

  const [assignOpen, setAssignOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  if (!order && !isMirroredAndPaid) {
    return (
      <div className="p-3 rounded-lg border border-dashed bg-muted/30 text-xs text-muted-foreground">
        Salesperson attribution is available once this website order is paid/processing.
      </div>
    );
  }
  if (!order) return null;

  const isAttributed =
    !!order.sales_attribution_locked && order.sales_person_id && order.sales_person_id !== SYSTEM_USER_ID;

  return (
    <div className="p-4 rounded-lg border border-primary/20 bg-muted/40 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Sales attribution</span>
        </div>
        {isAttributed ? (
          <Badge
            variant="outline"
            className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            title={`By ${order.attributed_by_name ?? 'manager'} on ${
              order.attributed_at ? new Date(order.attributed_at).toLocaleString('en-IN') : ''
            }`}
          >
            Credited to {order.sales_person_name} · {reasonLabel(order.sales_attribution_reason)}
          </Badge>
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

function AttributionLogList({ orderId }: { orderId: string }) {
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
}: {
  reason: string;
  setReason: (v: string) => void;
  customReason: string;
  setCustomReason: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
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
  const [query, setQuery] = useState('');

  const canSubmit =
    salesPersonId &&
    reason &&
    (reason !== 'other' || customReason.trim().length > 0);

  const submit = async () => {
    try {
      await attribute.mutateAsync({
        orderId,
        salesPersonId,
        reason,
        reasonCustom: reason === 'other' ? customReason.trim() : null,
      });
      toast({ title: 'Order attributed', description: 'Credit assigned to salesperson.' });
      onOpenChange(false);
      setSalesPersonId(''); setReason(''); setCustomReason('');
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign salesperson</DialogTitle>
          <DialogDescription>
            Credit this website order to a salesperson. They will get the same points a normal order earns.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
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
          />
        </div>
        <DialogFooter>
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
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const canSubmit = reason && (reason !== 'other' || customReason.trim().length > 0);

  const submit = async () => {
    try {
      await requestAttribution.mutateAsync({
        orderId,
        reason,
        reasonCustom: reason === 'other' ? customReason.trim() : null,
      });
      toast({
        title: 'Request submitted',
        description: 'Your request was sent to admins/sales managers.',
      });
      onOpenChange(false);
      setReason(''); setCustomReason('');
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request to claim this order</DialogTitle>
          <DialogDescription>
            Tell your manager why this website order should be credited to you. They will approve or reject.
          </DialogDescription>
        </DialogHeader>
        <ReasonFields
          reason={reason} setReason={setReason}
          customReason={customReason} setCustomReason={setCustomReason}
        />
        <DialogFooter>
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