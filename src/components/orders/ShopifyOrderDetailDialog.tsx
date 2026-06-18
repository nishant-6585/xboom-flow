import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ExternalLink, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
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

export function ShopifyOrderDetailDialog({ order, open, onOpenChange, onUpdated }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    payment_status: '',
    fulfillment_status: '',
    order_status: '',
    internal_notes: '',
    sales_notes: '',
    amount_paid: '',
  });

  useEffect(() => {
    if (!order) return;
    setForm({
      payment_status: normalizePayment(order.payment_status),
      fulfillment_status: normalizeFulfillment(order.fulfillment_status),
      order_status: normalizeOrderStatus(order.order_status),
      internal_notes: order.internal_notes ?? '',
      sales_notes: order.sales_notes ?? '',
      amount_paid: order.amount_paid != null ? String(order.amount_paid) : '',
    });
  }, [order]);

  if (!order) return null;

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
              <Label className="text-xs">Sales notes</Label>
              <Textarea
                value={form.sales_notes}
                onChange={(e) => setForm(f => ({ ...f, sales_notes: e.target.value }))}
                rows={2}
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
