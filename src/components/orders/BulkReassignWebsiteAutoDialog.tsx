import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useSalesUsers } from '@/hooks/useSalesUsers';
import {
  SYSTEM_USER_ID,
  useAttributionMutations,
} from '@/hooks/useAttributionRequests';
import type { WooCommerceOrder } from '@/hooks/useWooCommerceOrders';
import { ATTRIBUTION_REASONS } from './OrderAttributionPanel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Woo orders currently visible in the Website (Auto) filter. */
  wooOrders: WooCommerceOrder[];
  onDone?: () => void;
}

/**
 * Bulk reassign the salesperson for multiple WooCommerce (Vishal) orders
 * at once. Each row is attributed via the standard attribute_website_order
 * RPC, so the guard trigger's normalization + locking behaviour is
 * preserved (source → 'manual', sales_attribution_locked = true).
 */
export function BulkReassignWebsiteAutoDialog({
  open, onOpenChange, wooOrders, onDone,
}: Props) {
  const { salesUsers, isLoading: loadingSales } = useSalesUsers();
  const { attribute } = useAttributionMutations();

  const [selectedExternalIds, setSelectedExternalIds] = useState<Set<string>>(new Set());
  const [salesPersonId, setSalesPersonId] = useState('');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedExternalIds(new Set());
      setSalesPersonId('');
      setReason('');
      setCustomReason('');
      setProgress(null);
    }
  }, [open]);

  const pickable = useMemo(
    () => salesUsers.filter(
      (u) => u.user_id !== SYSTEM_USER_ID && (u.role === 'sales' || u.role === 'sales_manager'),
    ),
    [salesUsers],
  );

  const rows = useMemo(
    () => wooOrders.filter((o) => !!o.woo_order_id).slice(0, 100),
    [wooOrders],
  );

  const toggleAll = (checked: boolean) => {
    setSelectedExternalIds(
      checked ? new Set(rows.map((r) => String(r.woo_order_id))) : new Set(),
    );
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedExternalIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const canSubmit =
    !running
    && selectedExternalIds.size > 0
    && !!salesPersonId
    && !!reason
    && (reason !== 'other' || customReason.trim().length > 0);

  const submit = async () => {
    setRunning(true);
    setProgress({ done: 0, total: selectedExternalIds.size, failed: 0 });
    let done = 0;
    let failed = 0;
    try {
      const ids = Array.from(selectedExternalIds).map(String);
      // Resolve internal order ids for the selected Woo external_ids.
      const { data: internal, error: lookupErr } = await supabase
        .from('orders')
        .select('id, external_id')
        .in('external_id', ids);
      if (lookupErr) throw lookupErr;
      const byExt = new Map<string, string>();
      (internal ?? []).forEach((r: any) => byExt.set(String(r.external_id), r.id));

      for (const ext of ids) {
        const orderId = byExt.get(ext);
        if (!orderId) { failed++; continue; }
        try {
          await attribute.mutateAsync({
            orderId,
            salesPersonId,
            reason,
            reasonCustom: reason === 'other' ? customReason.trim() : null,
          });
          done++;
        } catch (e) {
          failed++;
          console.error('[bulk-reassign] failed for', ext, e);
        }
        setProgress({ done, total: ids.length, failed });
      }
      toast({
        title: failed === 0 ? 'Bulk attribution complete' : 'Bulk attribution finished with errors',
        description: `${done} attributed, ${failed} failed.`,
        variant: failed === 0 ? 'default' : 'destructive',
      });
      onDone?.();
      if (failed === 0) onOpenChange(false);
    } catch (e) {
      toast({
        title: 'Bulk attribution failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  };

  const allSelected = rows.length > 0 && selectedExternalIds.size === rows.length;

  return (
    <Dialog open={open} onOpenChange={(v) => !running && onOpenChange(v)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Bulk reassign WooCommerce (Vishal) orders
          </DialogTitle>
          <DialogDescription>
            Pick a salesperson and reason, then choose which unattributed
            website orders to credit. Each order is attributed individually
            so the standard normalization and locking rules still apply.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Salesperson</Label>
              <Select value={salesPersonId} onValueChange={setSalesPersonId} disabled={running}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingSales ? 'Loading…' : 'Pick a salesperson'} />
                </SelectTrigger>
                <SelectContent>
                  {pickable.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.name}{u.email ? ` · ${u.email}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason} disabled={running}>
                <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
                <SelectContent>
                  {ATTRIBUTION_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {reason === 'other' && (
            <div className="space-y-1.5">
              <Label>Please specify</Label>
              <Textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                rows={2}
                disabled={running}
                placeholder="Why should these orders be credited to this rep?"
              />
            </div>
          )}

          <div className="rounded-lg border">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(c) => toggleAll(!!c)}
                  disabled={running || rows.length === 0}
                  aria-label="Select all visible orders"
                />
                Select all ({rows.length})
              </label>
              <Badge variant="outline">
                {selectedExternalIds.size} selected
              </Badge>
            </div>
            <ul className="max-h-64 overflow-y-auto divide-y">
              {rows.length === 0 && (
                <li className="px-3 py-6 text-sm text-muted-foreground text-center">
                  No unattributed WooCommerce (Vishal) orders in view.
                </li>
              )}
              {rows.map((o) => {
                const ext = String(o.woo_order_id);
                const checked = selectedExternalIds.has(ext);
                return (
                  <li key={ext} className="px-3 py-2 flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => toggleOne(ext, !!c)}
                      disabled={running}
                      aria-label={`Select order ${o.woo_order_number ?? ext}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        #{o.woo_order_number ?? ext} · {o.customer_name || 'Unknown customer'}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {o.woo_status ? `status: ${o.woo_status}` : ''} · ₹{Number(o.total_amount || 0).toLocaleString('en-IN')}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {progress && (
            <div className="text-xs text-muted-foreground">
              Processed {progress.done}/{progress.total} · {progress.failed} failed
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Attribute {selectedExternalIds.size || ''} orders
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}