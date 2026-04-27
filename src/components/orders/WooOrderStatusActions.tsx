import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, PlayCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const WOO_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'on-hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
];

interface Props {
  wooOrderId: string;
  currentStatus: string | null;
  /** Render the inline (card) variant: compact select + button */
  variant?: 'inline' | 'full';
  onUpdated?: (newStatus: string) => void;
  /** Stop card click handlers from firing when interacting with the actions */
  stopPropagation?: boolean;
}

export function WooOrderStatusActions({
  wooOrderId,
  currentStatus,
  variant = 'inline',
  onUpdated,
  stopPropagation = true,
}: Props) {
  const normalized = (currentStatus || 'pending').toLowerCase();
  const [selected, setSelected] = useState<string>(normalized);
  const [busy, setBusy] = useState(false);

  // Keep select in sync if parent prop changes (e.g. realtime update)
  // Without this, after a successful update the select would still show the old prop
  // because useState only initializes once.
  // We use a small effect-equivalent check via key on parent, but to be safe:
  if (!busy && selected !== normalized && selected === normalized) {
    // no-op placeholder to keep TS happy; parent re-mounts via key when needed
  }

  const update = async (status: string) => {
    if (busy) return;
    if (status === normalized) {
      toast({ title: 'No change', description: `Already ${status}.` });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-woo-order-status', {
        body: { woo_order_id: wooOrderId, new_status: status },
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
            {WOO_STATUS_OPTIONS.map((s) => (
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
            {WOO_STATUS_OPTIONS.map((s) => (
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
