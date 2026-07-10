import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Ban, ArrowRight, ExternalLink, HandCoins, RefreshCw } from 'lucide-react';
import {
  DUPLICATE_ORDER_EVENT,
  type DuplicateOrderEventDetail,
  type DuplicateOrderMatch,
} from '@/lib/duplicateOrderGuard';

function formatMoney(n: number | null | undefined) {
  if (n == null) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatDaysAgo(d: number | null | undefined): string {
  if (d == null) return '';
  if (d === 0) return 'today';
  if (d === 1) return '1 day ago';
  return `${d} days ago`;
}

function MatchCard({ m, onView, onRequestTransfer }: {
  m: DuplicateOrderMatch;
  onView?: () => void;
  onRequestTransfer?: () => void;
}) {
  const isWebsite = m.source === 'website';
  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{m.order_number || '(no number)'}</span>
            {isWebsite ? (
              <Badge variant="secondary" className="bg-blue-500/15 text-blue-600">Website</Badge>
            ) : (
              <Badge variant="outline">Manual</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Salesperson: <span className="font-medium">{m.sales_person_name || 'unknown'}</span> ·
            {' '}Total: <span className="font-medium">{formatMoney(m.total_sales_amount)}</span> ·
            {' '}Order date: <span className="font-medium">{m.order_date || m.created_at?.slice(0, 10)}</span>
            {m.days_apart != null && (
              <>
                {' '}· <span className="font-medium">{formatDaysAgo(m.days_apart)}</span>
              </>
            )}
          </div>
        </div>
        <Badge variant={m.amount_diff_pct <= 5 ? 'destructive' : 'secondary'} className="shrink-0">
          {m.amount_diff_pct}% Δ
        </Badge>
      </div>
      {m.match_reasons?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {m.match_reasons.map((r) => (
            <Badge key={r} variant="outline" className="text-[10px] font-normal">{r}</Badge>
          ))}
        </div>
      )}
      {(onView || onRequestTransfer) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {onView && (
            <Button size="sm" variant="outline" onClick={onView} className="gap-1">
              <ExternalLink className="h-3.5 w-3.5" /> View existing order
            </Button>
          )}
          {onRequestTransfer && isWebsite && (
            <Button size="sm" variant="default" onClick={onRequestTransfer} className="gap-1">
              <HandCoins className="h-3.5 w-3.5" /> Request transfer to my name
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function DuplicateOrderGuardModal() {
  const [state, setState] = useState<DuplicateOrderEventDetail | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onEvent(e: Event) {
      const detail = (e as CustomEvent<DuplicateOrderEventDetail>).detail;
      if (!detail) return;
      setState(detail);
    }
    window.addEventListener(DUPLICATE_ORDER_EVENT, onEvent as EventListener);
    return () => window.removeEventListener(DUPLICATE_ORDER_EVENT, onEvent as EventListener);
  }, []);

  function close(decision: 'proceed' | 'cancel') {
    state?.resolve(decision);
    setState(null);
  }

  if (!state) return null;
  const hard = state.severity === 'hard';
  const repeat = state.severity === 'repeat';
  const primaryMatch = state.matches[0];

  // Sort repeat matches newest-first for the listing.
  const displayMatches = repeat
    ? [...state.matches].sort((a, b) => {
        const da = (a.days_apart ?? Number.POSITIVE_INFINITY);
        const db = (b.days_apart ?? Number.POSITIVE_INFINITY);
        return da - db;
      })
    : state.matches;

  const titleTone = hard
    ? 'text-destructive'
    : repeat
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-warning';

  return (
    <Dialog open onOpenChange={(o) => { if (!o) close('cancel'); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${titleTone}`}>
            {hard
              ? <Ban className="h-5 w-5" />
              : repeat
                ? <RefreshCw className="h-5 w-5" />
                : <AlertTriangle className="h-5 w-5" />}
            {hard
              ? 'Order creation blocked — duplicate detected'
              : repeat
                ? 'Repeat purchase — confirm before creating'
                : 'Possible duplicate order'}
          </DialogTitle>
          <DialogDescription>
            {hard
              ? 'This order matches an existing one on customer, product, date and amount. If the website already recorded it, request a transfer instead of creating a new order.'
              : repeat
                ? 'An order for this customer and product already exists. Confirm this is a genuine repeat purchase before creating a new one.'
                : 'We found a similar recent order. Please check before proceeding.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[45vh] overflow-y-auto">
          {displayMatches.length === 0 && primaryMatch === undefined ? (
            <div className="rounded-lg border bg-muted/50 p-3 text-sm">
              {state.triggerMessage || 'A matching order was rejected server-side.'}
            </div>
          ) : (
            displayMatches.map((m, i) => (
              <MatchCard
                key={(m.id || m.order_number || String(i))}
                m={m}
                onView={m.id ? () => { close('cancel'); navigate(`/orders?tab=list&highlight=${m.id}`); } : undefined}
                onRequestTransfer={m.id ? () => { close('cancel'); navigate(`/orders?tab=claim&order=${m.id}`); } : undefined}
              />
            ))
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => close('cancel')}>Cancel</Button>
          {repeat && (
            <Button
              variant="default"
              onClick={() => close('proceed')}
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
            >
              Yes, create new order <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {!hard && !repeat && (
            <Button variant="default" onClick={() => close('proceed')} className="gap-2">
              Proceed anyway <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DuplicateOrderGuardModal;