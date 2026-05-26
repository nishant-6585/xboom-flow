import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, CheckCircle2, PlayCircle, XCircle, Lock, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const WOO_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'on-hold', label: 'On Hold' },
  // Custom WooCommerce status — must be registered on the WC site as `wc-shipped`.
  // Sits between Processing and Completed in the fulfilment lifecycle.
  { value: 'shipped', label: 'Shipped' },
  { value: 'completed', label: 'Completed' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
];

/** Statuses that lock the order — no further changes allowed except explicit reopen. */
export const TERMINAL_STATUSES = new Set(['cancelled', 'failed', 'refunded']);

/**
 * Returns the list of statuses a user is allowed to transition INTO from `from`.
 * Terminal states return [] (caller should render the locked UI / reopen flow).
 */
function allowedTransitions(from: string): string[] {
  if (TERMINAL_STATUSES.has(from)) return [];
  // From any non-terminal state, allow moving to any other non-terminal state
  // plus cancellation/failure/refund (terminal exits).
  return WOO_STATUS_OPTIONS.map((s) => s.value).filter((v) => v !== from);
}

interface Props {
  wooOrderId: string;
  currentStatus: string | null;
  /** Render the inline (card) variant: compact select + button */
  variant?: 'inline' | 'full';
  onUpdated?: (newStatus: string) => void;
  /** Stop card click handlers from firing when interacting with the actions */
  stopPropagation?: boolean;
  /**
   * When true (default), moving the order to `shipped` is blocked unless
   * `hasTracking` is true. The parent should render a tracking-info form and
   * pass `onTrackingNeeded` to focus/scroll the user there.
   */
  requireTrackingForShipped?: boolean;
  /** Whether the parent already has tracking number + courier saved. */
  hasTracking?: boolean;
  /** Current tracking values — pushed to Woo alongside the `shipped` status. */
  tracking?: {
    carrier?: string | null;
    number?: string | null;
    url?: string | null;
    expected?: string | null;
  };
  /** Invoked when the user picks `shipped` but tracking is missing. */
  onTrackingNeeded?: () => void;
}

export function WooOrderStatusActions({
  wooOrderId,
  currentStatus,
  variant = 'inline',
  onUpdated,
  stopPropagation = true,
  requireTrackingForShipped = true,
  hasTracking = false,
  tracking,
  onTrackingNeeded,
}: Props) {
  const normalized = (currentStatus || 'pending').toLowerCase();
  const [selected, setSelected] = useState<string>(normalized);
  const [busy, setBusy] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);

  const isTerminal = TERMINAL_STATUSES.has(normalized);
  const allowed = allowedTransitions(normalized);

  const update = async (status: string, opts: { allowReopen?: boolean } = {}) => {
    if (busy) return;
    if (status === normalized) {
      toast({ title: 'No change', description: `Already ${status}.` });
      return;
    }
    // Tracking is mandatory before we can flip a Woo order to `shipped`.
    // Bail out and let the parent surface the tracking form to the user.
    if (status === 'shipped' && requireTrackingForShipped && !hasTracking) {
      toast({
        title: 'Tracking information required',
        description:
          'Add courier + tracking number before marking this order as Shipped.',
        variant: 'destructive',
      });
      setSelected(normalized);
      onTrackingNeeded?.();
      return;
    }
    // Frontend guard against invalid transitions
    if (isTerminal && !opts.allowReopen) {
      toast({
        title: 'Order is in a final state',
        description: `Cannot move ${normalized} → ${status} without reopen.`,
        variant: 'destructive',
      });
      return;
    }
    setBusy(true);
    try {
      // When transitioning to `shipped`, ship the saved tracking info along
      // so WooCommerce's order meta stays in sync in a single call.
      const trackingPayload =
        status === 'shipped' && tracking
          ? {
              tracking_carrier: tracking.carrier || undefined,
              tracking_number: tracking.number || undefined,
              tracking_url: tracking.url || undefined,
              expected_delivery: tracking.expected || undefined,
            }
          : {};
      const { data, error } = await supabase.functions.invoke('update-woo-order-status', {
        body: {
          woo_order_id: wooOrderId,
          new_status: status,
          allow_reopen: opts.allowReopen === true,
          ...trackingPayload,
        },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || 'Update failed');
      toast({
        title: 'Status updated',
        description: `Order #${wooOrderId} → ${status}`,
      });
      onUpdated?.(status);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      // Revert UI selection on failure
      setSelected(normalized);
      toast({ title: 'Update failed', description: msg, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const stop = (e: React.SyntheticEvent) => {
    if (stopPropagation) e.stopPropagation();
  };

  // ---------------- Terminal state UI ----------------
  if (isTerminal) {
    const reopenable = normalized === 'cancelled';
    return (
      <TooltipProvider delayDuration={200}>
        <div
          className="flex items-center justify-between gap-2"
          onClick={stop}
          onPointerDown={stop}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="gap-1 text-[10px] font-medium text-muted-foreground border-dashed"
              >
                <Lock className="h-3 w-3" /> Final state
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              This order is {normalized} and cannot be modified.
            </TooltipContent>
          </Tooltip>

          {reopenable && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setConfirmReopen(true)}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <RotateCcw className="h-3 w-3" /> Reopen
                  </>
                )}
              </Button>
              <AlertDialog open={confirmReopen} onOpenChange={setConfirmReopen}>
                <AlertDialogContent onClick={stop}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reopen this order?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will move order #{wooOrderId} back to{' '}
                      <strong>Processing</strong> in WooCommerce. Continue?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={busy}
                      onClick={async (e) => {
                        e.preventDefault();
                        await update('processing', { allowReopen: true });
                        setConfirmReopen(false);
                      }}
                    >
                      {busy ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                          Reopening…
                        </>
                      ) : (
                        'Reopen Order'
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </TooltipProvider>
    );
  }

  // ---------------- Active state UI ----------------
  const visibleOptions = WOO_STATUS_OPTIONS.filter(
    (s) => s.value === normalized || allowed.includes(s.value),
  );

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-1.5" onClick={stop} onPointerDown={stop}>
        <Select
          value={selected}
          onValueChange={setSelected}
          disabled={busy}
        >
          <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {visibleOptions.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-8 px-2.5 text-xs"
          onClick={() => update(selected)}
          disabled={busy || selected === normalized}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Update'}
        </Button>
      </div>
    );
  }

  // Full variant — used in the detail dialog
  return (
    <div className="space-y-3" onClick={stop}>
      <div className="flex items-center gap-2">
        <Select value={selected} onValueChange={setSelected} disabled={busy}>
          <SelectTrigger className="h-9 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {visibleOptions.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={() => update(selected)}
          disabled={busy || selected === normalized}
          className="h-9"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Updating…
            </>
          ) : (
            'Update Status'
          )}
        </Button>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => update('processing')}
          disabled={busy || normalized === 'processing'}
          className="gap-1.5"
        >
          <PlayCircle className="h-3.5 w-3.5" /> Mark Processing
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => update('completed')}
          disabled={busy || normalized === 'completed'}
          className="gap-1.5"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Mark Completed
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => update('cancelled')}
          disabled={busy || normalized === 'cancelled'}
          className="gap-1.5 text-destructive hover:text-destructive"
        >
          <XCircle className="h-3.5 w-3.5" /> Cancel Order
        </Button>
      </div>
    </div>
  );
}
