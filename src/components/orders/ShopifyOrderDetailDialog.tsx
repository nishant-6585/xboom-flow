import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ExternalLink, Save, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useEditHistory } from '@/hooks/useEditHistory';
import { SalesNotesAuditPanel } from '@/components/orders/SalesNotesAuditPanel';
import type { ShopifyOrder } from '@/hooks/useShopifyOrders';

interface Props {
  order: ShopifyOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

// Aligned to Shopify's actual enum values (financial_status, fulfillment_status, order status).
// Notes:
//  - Shopify fulfillment_status is derived from fulfillment events — only unfulfilled / partial / fulfilled exist.
//  - To revert a fulfilled order to unfulfilled, Shopify requires cancelling the fulfillment.
//  - Refunds must be issued from Shopify (line items + restock decisions required).
const PAYMENT_OPTIONS = ['pending', 'authorized', 'partially_paid', 'paid', 'partially_refunded', 'refunded', 'voided'];
const FULFILLMENT_OPTIONS = ['unfulfilled', 'partial', 'fulfilled'];
const ORDER_STATUS_OPTIONS = ['open', 'closed', 'cancelled'];

// Map legacy / non-Shopify values stored in DB to the closest valid Shopify enum.
function normalizePayment(v: string | null | undefined): string {
  if (!v) return '';
  const s = v.toLowerCase();
  if (s === 'full') return 'paid';
  if (s === 'partial') return 'partially_paid';
  return PAYMENT_OPTIONS.includes(s) ? s : '';
}
function normalizeFulfillment(v: string | null | undefined): string {
  if (!v) return '';
  const s = v.toLowerCase();
  if (s === 'shipped' || s === 'delivered') return 'fulfilled';
  if (s === 'cancelled' || s === 'canceled') return 'unfulfilled';
  return FULFILLMENT_OPTIONS.includes(s) ? s : '';
}
function normalizeOrderStatus(v: string | null | undefined): string {
  if (!v) return '';
  const s = v.toLowerCase();
  if (s === 'on_hold') return 'open';
  if (s === 'canceled') return 'cancelled';
  return ORDER_STATUS_OPTIONS.includes(s) ? s : '';
}

function buildAutoSalesNotes(payment: string, fulfillment: string, orderStatus: string): string {
  const parts = [
    `Fulfillment: ${fulfillment || 'unfulfilled'}`,
    `Payment: ${payment || 'pending'}`,
    `Order: ${orderStatus || 'open'}`,
  ];
  return parts.join(' | ');
}

export function ShopifyOrderDetailDialog({ order, open, onOpenChange, onUpdated }: Props) {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const { recordChanges } = useEditHistory();
  const [saving, setSaving] = useState(false);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle');
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [conflict, setConflict] = useState<{ serverValue: string; serverUpdatedAt: string } | null>(null);
  const [form, setForm] = useState({
    payment_status: '',
    fulfillment_status: '',
    order_status: '',
    internal_notes: '',
    sales_notes: '',
    amount_paid: '',
  });
  // Baselines for autosave diffing + optimistic concurrency
  const lastSavedSalesNotesRef = useRef<string>('');
  const baselineUpdatedAtRef = useRef<string>('');
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!order) return;
    const payment = normalizePayment(order.payment_status);
    const fulfillment = normalizeFulfillment(order.fulfillment_status);
    const orderStatus = normalizeOrderStatus(order.order_status);
    const salesNotes = order.sales_notes ?? buildAutoSalesNotes(payment, fulfillment, orderStatus);
    setForm({
      payment_status: payment,
      fulfillment_status: fulfillment,
      order_status: orderStatus,
      internal_notes: order.internal_notes ?? '',
      sales_notes: salesNotes,
      amount_paid: order.amount_paid != null ? String(order.amount_paid) : '',
    });
    lastSavedSalesNotesRef.current = salesNotes;
    baselineUpdatedAtRef.current = order.updated_at ?? '';
    setAutosaveState('idle');
    setConflict(null);
  }, [order]);

  // Shared sales-notes saver with optimistic-concurrency check
  const persistSalesNotes = useCallback(async (value: string, opts: { force?: boolean } = {}) => {
    if (!order) return false;
    const previous = lastSavedSalesNotesRef.current;
    if (value === previous && !opts.force) return true;

    setAutosaveState('saving');
    try {
      // Optimistic concurrency: confirm nobody changed it since we loaded
      if (!opts.force) {
        const { data: latest, error: readError } = await supabase
          .from('shopify_orders')
          .select('updated_at, sales_notes')
          .eq('id', order.id)
          .single();
        if (readError) throw readError;
        const serverUpdatedAt = latest?.updated_at ?? '';
        const serverValue = latest?.sales_notes ?? '';
        if (
          baselineUpdatedAtRef.current &&
          serverUpdatedAt &&
          serverUpdatedAt !== baselineUpdatedAtRef.current &&
          serverValue !== previous
        ) {
          setConflict({ serverValue, serverUpdatedAt });
          setAutosaveState('conflict');
          return false;
        }
      }

      const newUpdatedAt = new Date().toISOString();
      const { error } = await supabase
        .from('shopify_orders')
        .update({ sales_notes: value || null, updated_at: newUpdatedAt })
        .eq('id', order.id);
      if (error) throw error;

      if (user && previous !== value) {
        await recordChanges(
          'shopify_orders',
          order.id,
          { sales_notes: { old: previous, new: value } },
          profile?.name || user.email || 'Unknown',
        );
      }

      lastSavedSalesNotesRef.current = value;
      baselineUpdatedAtRef.current = newUpdatedAt;
      setConflict(null);
      setAutosaveState('saved');
      setHistoryRefreshKey(k => k + 1);
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
      savedFlashTimerRef.current = setTimeout(() => setAutosaveState('idle'), 1500);
      return true;
    } catch (e: unknown) {
      console.error('Sales notes save failed:', e);
      setAutosaveState('error');
      toast({
        title: 'Could not save sales notes',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
      return false;
    }
  }, [order, user, profile?.name, recordChanges, toast]);

  // Debounced autosave for sales_notes only
  useEffect(() => {
    if (!order || !open) return;
    const current = form.sales_notes ?? '';
    if (current === lastSavedSalesNotesRef.current) return;
    if (conflict) return; // pause autosave while a conflict is unresolved

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    setAutosaveState('saving');
    autosaveTimerRef.current = setTimeout(() => {
      persistSalesNotes(current);
    }, 1000);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [form.sales_notes, order, open, conflict, persistSalesNotes]);

  useEffect(() => () => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
  }, []);

  if (!order) return null;

  const handleManualSaveNotes = async () => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    const ok = await persistSalesNotes(form.sales_notes ?? '');
    if (ok) toast({ title: 'Sales notes saved' });
  };

  const handleResolveConflictKeepMine = async () => {
    // Force overwrite using current local value
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    await persistSalesNotes(form.sales_notes ?? '', { force: true });
  };

  const handleResolveConflictUseServer = () => {
    if (!conflict) return;
    const sv = conflict.serverValue ?? '';
    setForm(f => ({ ...f, sales_notes: sv }));
    lastSavedSalesNotesRef.current = sv;
    baselineUpdatedAtRef.current = conflict.serverUpdatedAt;
    setConflict(null);
    setAutosaveState('idle');
    toast({ title: 'Loaded latest version', description: 'Discarded your unsaved sales-notes edits.' });
    setHistoryRefreshKey(k => k + 1);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        payment_status: form.payment_status || null,
        fulfillment_status: form.fulfillment_status || null,
        order_status: form.order_status || null,
        internal_notes: form.internal_notes || null,
        sales_notes: form.sales_notes || null,
        amount_paid: form.amount_paid === '' ? null : Number(form.amount_paid),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('shopify_orders')
        .update(payload)
        .eq('id', order.id);
      if (error) throw error;

      // Push status changes back to Shopify (only changed fields, and only ones Shopify can accept)
      const pushBody: Record<string, unknown> = {
        shopify_order_id: order.shopify_order_id,
        shop_domain: order.shop_domain,
      };
      if (form.order_status && form.order_status !== (order.order_status ?? '')) {
        pushBody.order_status = form.order_status;
      }
      if (form.fulfillment_status && form.fulfillment_status !== (order.fulfillment_status ?? '')) {
        pushBody.fulfillment_status = form.fulfillment_status;
      }
      if (form.payment_status && form.payment_status !== (order.payment_status ?? '')) {
        pushBody.payment_status = form.payment_status;
      }

      const hasPush = Object.keys(pushBody).length > 2;
      if (hasPush) {
        const { data: pushData, error: pushError } = await supabase.functions.invoke(
          'shopify-push-update',
          { body: pushBody },
        );
        type PushResult = { action: string; ok: boolean; error?: string };
        const results: PushResult[] = (pushData?.results ?? []) as PushResult[];
        const failed = results.filter(r => !r.ok);
        if (pushError || failed.length > 0) {
          const msg = pushError?.message
            || failed.map(f => `${f.action}: ${f.error ?? 'failed'}`).join(' • ');
          toast({
            title: 'Saved locally, Shopify push had issues',
            description: msg,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Order updated',
            description: `#${order.order_number || order.shopify_order_id} synced to Shopify.`,
          });
        }
      } else {
        toast({ title: 'Order updated', description: `#${order.order_number || order.shopify_order_id} saved.` });
      }

      onUpdated?.();
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update order';
      toast({ title: 'Update failed', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const shopUrl = order.shop_domain && order.shopify_order_id
    ? `https://${order.shop_domain}/admin/orders/${order.shopify_order_id}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="font-mono">#{order.order_number || order.shopify_order_id}</span>
            <Badge variant="secondary" className="capitalize">Shopify</Badge>
            {shopUrl && (
              <a
                href={shopUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open in Shopify <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </DialogTitle>
          <DialogDescription>
            {order.customer_name} • {fmtDate(order.shopify_created_at || order.created_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Customer */}
          <section>
            <h3 className="font-semibold mb-2">Customer</h3>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div><span className="text-foreground">Name:</span> {order.customer_name}</div>
              {order.customer_company && <div><span className="text-foreground">Company:</span> {order.customer_company}</div>}
              {order.customer_email && <div><span className="text-foreground">Email:</span> {order.customer_email}</div>}
              {order.customer_phone && <div><span className="text-foreground">Phone:</span> {order.customer_phone}</div>}
            </div>
            {order.shipping_address && (
              <div className="mt-2"><span className="text-foreground font-medium">Ship to:</span> <span className="text-muted-foreground">{order.shipping_address}</span></div>
            )}
          </section>

          <Separator />

          {/* Product / amounts */}
          <section>
            <h3 className="font-semibold mb-2">Order</h3>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div><span className="text-foreground">Product:</span> {order.product_name}</div>
              {order.product_code && <div><span className="text-foreground">SKU:</span> {order.product_code}</div>}
              <div><span className="text-foreground">Qty:</span> {order.quantity}</div>
              <div><span className="text-foreground">Total:</span> ₹{(order.total_sales_amount || 0).toLocaleString()}</div>
            </div>
          </section>

          <Separator />

          {/* Editable fields */}
          <section className="space-y-3">
            <h3 className="font-semibold">Update</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Payment status</Label>
                <Select value={form.payment_status} onValueChange={(v) => setForm(f => ({ ...f, payment_status: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_OPTIONS.map(o => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Fulfillment</Label>
                <Select value={form.fulfillment_status} onValueChange={(v) => setForm(f => ({ ...f, fulfillment_status: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {FULFILLMENT_OPTIONS.map(o => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Order status</Label>
                <Select value={form.order_status} onValueChange={(v) => setForm(f => ({ ...f, order_status: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUS_OPTIONS.map(o => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Amount paid (₹)</Label>
              <Input
                type="number"
                value={form.amount_paid}
                onChange={(e) => setForm(f => ({ ...f, amount_paid: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Sales notes</Label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground min-w-[60px] text-right">
                    {autosaveState === 'saving' && (
                      <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>
                    )}
                    {autosaveState === 'saved' && (
                      <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400"><Check className="h-3 w-3" /> Saved</span>
                    )}
                    {autosaveState === 'error' && <span className="text-destructive">Save failed</span>}
                    {autosaveState === 'conflict' && (
                      <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" /> Conflict</span>
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1"
                    onClick={handleManualSaveNotes}
                    disabled={autosaveState === 'saving'}
                  >
                    <Save className="h-3 w-3" /> Save notes
                  </Button>
                  <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => {
                    const snap = buildAutoSalesNotes(form.payment_status, form.fulfillment_status, form.order_status);
                    setForm(f => ({
                      ...f,
                      sales_notes: f.sales_notes && !f.sales_notes.endsWith(snap)
                        ? `${f.sales_notes}\n${snap}`
                        : (f.sales_notes || snap),
                    }));
                  }}
                >
                  Insert status snapshot
                  </Button>
                </div>
              </div>
              <Textarea
                value={form.sales_notes}
                onChange={(e) => setForm(f => ({ ...f, sales_notes: e.target.value }))}
                rows={3}
                placeholder="Add notes for the sales team…"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Autosaves a second after you stop typing — or click "Save notes" to push immediately. Concurrent edits are detected before overwriting.
              </p>
              {conflict && (
                <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs space-y-2">
                  <div className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" /> Someone else updated these sales notes
                  </div>
                  <div className="text-muted-foreground">
                    Latest server version (saved {fmtDate(conflict.serverUpdatedAt)}):
                  </div>
                  <div className="rounded bg-background border p-1.5 max-h-24 overflow-y-auto whitespace-pre-wrap">
                    {conflict.serverValue || '(empty)'}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]"
                      onClick={handleResolveConflictUseServer}>
                      Use server version
                    </Button>
                    <Button type="button" size="sm" className="h-7 text-[10px]"
                      onClick={handleResolveConflictKeepMine}>
                      Overwrite with mine
                    </Button>
                  </div>
                </div>
              )}

              <SalesNotesAuditPanel
                orderId={order.id}
                orderLabel={order.order_number || order.shopify_order_id}
                refreshKey={historyRefreshKey}
                onUndo={(prev) => setForm(f => ({ ...f, sales_notes: prev }))}
              />
            </div>
            <div>
              <Label className="text-xs">Internal notes</Label>
              <Textarea
                value={form.internal_notes}
                onChange={(e) => setForm(f => ({ ...f, internal_notes: e.target.value }))}
                rows={2}
              />
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
