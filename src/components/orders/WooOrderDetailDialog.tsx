import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ArrowRight, History, AlertCircle, MessageCircle, RefreshCw, Truck, MapPin, Package, ExternalLink, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { WooCommerceOrder } from '@/hooks/useWooCommerceOrders';
import { WooOrderStatusActions } from './WooOrderStatusActions';
import { useOrderNotificationTimeline } from '@/hooks/useOrderNotification';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { CourierCombobox } from '@/components/CourierCombobox';
import { buildTrackingUrl } from '@/lib/courierTracking';

const TRACKING_ROLES = new Set(['admin', 'supply_chain', 'sales_manager', 'finance']);

interface StatusLog {
  id: string;
  previous_status: string | null;
  new_status: string;
  changed_by_email: string | null;
  source: string | null;
  woo_api_success: boolean | null;
  error_message: string | null;
  created_at: string;
}

interface Props {
  order: WooCommerceOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Triggered when a status update succeeds, so parent can refetch */
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

/** Heavy fields not in the list query — fetched lazily when the dialog opens. */
interface WooDetail {
  shipping_address: string | null;
  line_items: unknown;
  courier: string | null;
  expected_delivery: string | null;
  internal_notes: string | null;
  sales_notes: string | null;
}

interface WooLineItem {
  name?: string;
  product_name?: string;
  quantity?: number;
  qty?: number;
  price?: number | string;
  total?: number | string;
  subtotal?: number | string;
  sku?: string;
}

function normalizeLineItems(raw: unknown): WooLineItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as WooLineItem[];
  return [];
}

export function WooOrderDetailDialog({ order, open, onOpenChange, onUpdated }: Props) {
  const [logs, setLogs] = useState<StatusLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  // Bumping this re-mounts the actions component so it picks up the new currentStatus
  const [actionsKey, setActionsKey] = useState(0);
  const { role } = useAuth();
  const canEditTracking = !!role && TRACKING_ROLES.has(role);

  const [detail, setDetail] = useState<WooDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [editingTracking, setEditingTracking] = useState(false);
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [savingExtra, setSavingExtra] = useState(false);
  // Tracking card ref → scroll user here when they pick Shipped w/o tracking.
  const trackingSectionRef = useRef<HTMLElement>(null);
  const focusTrackingSection = () => {
    setEditingTracking(true);
    setTimeout(() => {
      trackingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  useEffect(() => {
    if (!open || !order) return;
    setCarrier(order.tracking_status || order.courier || '');
    setTrackingNumber(order.tracking_number || '');
    setTrackingUrl('');
    setExpectedDelivery(order.expected_delivery || '');
    setCustomerNote('');
    setEditingTracking(false);
  }, [open, order]);

  // Auto-generate tracking URL when carrier + number set and URL still empty
  // (mirrors manual OrderDialog behaviour).
  useEffect(() => {
    if (!carrier || !trackingNumber) return;
    const generated = buildTrackingUrl(carrier, trackingNumber);
    if (generated && !trackingUrl) setTrackingUrl(generated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrier, trackingNumber]);

  // Fetch heavy detail row (line_items, shipping_address, …) when the dialog opens.
  useEffect(() => {
    if (!open || !order) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    supabase
      .from('woocommerce_orders')
      .select('shipping_address, line_items, courier, expected_delivery, internal_notes, sales_notes')
      .eq('woo_order_id', order.woo_order_id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setDetail((data as WooDetail) || null);
        setDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, order]);

  const lineItems = useMemo(() => normalizeLineItems(detail?.line_items), [detail]);

  const saveExtras = async () => {
    if (!order || savingExtra) return;
    const carrierChanged = (carrier || '') !== (order.tracking_status || order.courier || '');
    const numberChanged = (trackingNumber || '') !== (order.tracking_number || '');
    const urlChanged = !!trackingUrl.trim();
    const etaChanged = (expectedDelivery || '') !== (order.expected_delivery || '');
    const noteProvided = customerNote.trim().length > 0;
    if (!carrierChanged && !numberChanged && !urlChanged && !etaChanged && !noteProvided) {
      toast({ title: 'Nothing to save', description: 'No changes detected.' });
      return;
    }
    setSavingExtra(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-woo-order-status', {
        body: {
          woo_order_id: order.woo_order_id,
          tracking_carrier: carrierChanged ? carrier.trim() : undefined,
          tracking_number: numberChanged ? trackingNumber.trim() : undefined,
          tracking_url: urlChanged ? trackingUrl.trim() : undefined,
          expected_delivery: etaChanged ? (expectedDelivery || undefined) : undefined,
          customer_note: noteProvided ? customerNote.trim() : undefined,
        },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || 'Update failed');
      toast({ title: 'Saved & pushed to Woo', description: `Order #${order.order_number || order.woo_order_id}` });
      setCustomerNote('');
      setEditingTracking(false);
      onUpdated?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update';
      toast({ title: 'Update failed', description: msg, variant: 'destructive' });
    } finally {
      setSavingExtra(false);
    }
  };

  const {
    items: notifications,
    loading: notifLoading,
    retryingId,
    retryOne,
  } = useOrderNotificationTimeline(order?.woo_order_id ?? null, open);

  useEffect(() => {
    if (!open || !order) return;
    let cancelled = false;
    setLogsLoading(true);
    supabase
      .from('woocommerce_order_status_logs')
      .select('id, previous_status, new_status, changed_by_email, source, woo_api_success, error_message, created_at')
      .eq('woo_order_id', order.woo_order_id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (cancelled) return;
        setLogs((data as StatusLog[]) || []);
        setLogsLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, order, actionsKey]);

  if (!order) return null;

  const amount = order.total_sales_amount || order.selling_price || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Order #{order.order_number || order.woo_order_id}
            <Badge variant="outline" className="capitalize">
              {order.order_status || 'pending'}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {order.customer_name || order.customer_email || 'Unknown customer'} ·{' '}
            ₹{amount.toLocaleString('en-IN')}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-5 pb-2">
            {/* Order summary */}
            <section className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Product" value={order.product_name} />
              <Field label="Quantity" value={String(order.quantity)} />
              <Field label="Customer" value={order.customer_name} />
              <Field label="Email" value={order.customer_email} />
              <Field label="Payment" value={order.payment_status} capitalize />
              <Field label="Currency" value={order.currency} />
              <Field label="Created" value={fmtDate(order.woo_created_at || order.created_at)} />
              <Field label="Last sync" value={fmtDate(order.woo_updated_at || order.updated_at)} />
            </section>

            <Separator />

            {/* Shipping address */}
            <section className="p-4 bg-muted/50 rounded-lg space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Shipping Address
              </h4>
              {detailLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </div>
              ) : (
                <p className="text-sm whitespace-pre-line">
                  {detail?.shipping_address || 'No address provided'}
                </p>
              )}
            </section>

            {/* Order items (from Woo line_items) */}
            <section className="p-4 bg-muted/50 rounded-lg space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Package className="h-4 w-4" /> Order Items
                {lineItems.length > 0 && (
                  <span className="text-xs text-muted-foreground font-normal">
                    ({lineItems.length})
                  </span>
                )}
              </h4>
              {detailLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </div>
              ) : lineItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">No line items recorded.</p>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="border-b border-border/50">
                        <th className="text-left py-1.5 px-1 font-medium">Product</th>
                        <th className="text-right py-1.5 px-1 font-medium">Qty</th>
                        <th className="text-right py-1.5 px-1 font-medium">Price</th>
                        <th className="text-right py-1.5 px-1 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((it, idx) => {
                        const qty = Number(it.quantity ?? it.qty ?? 0) || 0;
                        const price = Number(it.price ?? 0) || 0;
                        const total = Number(it.total ?? it.subtotal ?? price * qty) || 0;
                        return (
                          <tr key={idx} className="border-b border-border/30 last:border-0">
                            <td className="py-1.5 px-1">
                              <div className="font-medium">{it.name || it.product_name || '—'}</div>
                              {it.sku && <div className="text-[10px] text-muted-foreground">{it.sku}</div>}
                            </td>
                            <td className="text-right py-1.5 px-1">{qty}</td>
                            <td className="text-right py-1.5 px-1">₹{price.toLocaleString('en-IN')}</td>
                            <td className="text-right py-1.5 px-1 font-medium">₹{total.toLocaleString('en-IN')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <Separator />

            {/* Status update */}
            <section>
              <h3 className="text-sm font-semibold mb-3">Update Status</h3>
              <WooOrderStatusActions
                key={actionsKey}
                wooOrderId={order.woo_order_id}
                currentStatus={order.order_status}
                variant="full"
                hasTracking={
                  !!((order.tracking_number || trackingNumber) &&
                     (order.tracking_status || order.courier || carrier))
                }
                tracking={{
                  carrier: carrier || order.tracking_status || order.courier || null,
                  number: trackingNumber || order.tracking_number || null,
                  url: trackingUrl || null,
                  expected: expectedDelivery || order.expected_delivery || null,
                }}
                onTrackingNeeded={focusTrackingSection}
                onUpdated={() => {
                  setActionsKey((k) => k + 1);
                  onUpdated?.();
                }}
              />
            </section>

            <Separator />

            {/* Tracking + customer note → push to Woo. Mirrors manual OrderDialog UI. */}
            {canEditTracking && (
              <>
                <section ref={trackingSectionRef} className="p-4 bg-muted/50 rounded-lg space-y-3 scroll-mt-20">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      <Truck className="h-4 w-4" /> Tracking Information
                    </h4>
                    {!editingTracking ? (
                      <Button variant="ghost" size="sm" onClick={() => setEditingTracking(true)} className="h-7 text-xs">
                        Edit
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setEditingTracking(false)} className="h-7 text-xs text-muted-foreground">
                        Cancel
                      </Button>
                    )}
                  </div>

                  {editingTracking ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="woo-carrier" className="text-xs">Courier Name</Label>
                          <CourierCombobox
                            id="woo-carrier"
                            value={carrier}
                            onChange={setCarrier}
                            disabled={savingExtra}
                            placeholder="Select courier…"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="woo-tracking" className="text-xs">Tracking Number</Label>
                          <Input
                            id="woo-tracking"
                            value={trackingNumber}
                            onChange={(e) => setTrackingNumber(e.target.value)}
                            placeholder="AWB / Tracking ID"
                            className="h-9"
                            disabled={savingExtra}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="woo-tracking-url" className="text-xs">Tracking URL</Label>
                          <Input
                            id="woo-tracking-url"
                            type="url"
                            value={trackingUrl}
                            onChange={(e) => setTrackingUrl(e.target.value)}
                            placeholder="https://…"
                            className="h-9"
                            disabled={savingExtra}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="woo-eta" className="text-xs">Estimated Delivery</Label>
                          <Input
                            id="woo-eta"
                            type="date"
                            value={expectedDelivery}
                            onChange={(e) => setExpectedDelivery(e.target.value)}
                            className="h-9"
                            disabled={savingExtra}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="woo-note" className="text-xs">Customer note (optional, pushed to Woo)</Label>
                        <Textarea
                          id="woo-note"
                          value={customerNote}
                          onChange={(e) => setCustomerNote(e.target.value)}
                          placeholder="Visible to the customer in their Woo order timeline."
                          className="min-h-[60px] text-sm"
                          disabled={savingExtra}
                          maxLength={2000}
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button onClick={saveExtras} disabled={savingExtra} size="sm">
                          {savingExtra ? (
                            <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Saving…</>
                          ) : (
                            'Save & push to Woo'
                          )}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2 text-sm">
                      {(carrier) && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Courier:</span>
                          <span className="font-medium">{carrier}</span>
                        </div>
                      )}
                      {trackingNumber && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Tracking Number:</span>
                          {trackingUrl ? (
                            <a
                              href={trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              {trackingNumber}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span>{trackingNumber}</span>
                          )}
                        </div>
                      )}
                      {expectedDelivery && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Est. Delivery:</span>
                          <span>{expectedDelivery}</span>
                        </div>
                      )}
                      {!carrier && !trackingNumber && !expectedDelivery && (
                        <p className="text-sm text-muted-foreground">No tracking information yet</p>
                      )}
                    </div>
                  )}
                </section>
                <Separator />
              </>
            )}

            {/* Status history */}
            <section>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <History className="h-4 w-4" /> Status History
              </h3>

              {logsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>
              ) : (
                <ul className="space-y-2">
                  {logs.map((l) => (
                    <li
                      key={l.id}
                      className="rounded-md border border-border/50 p-2.5 text-xs space-y-1"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0">
                          {l.previous_status || '—'}
                        </Badge>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0">
                          {l.new_status}
                        </Badge>
                        {l.woo_api_success === false && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 gap-1">
                            <AlertCircle className="h-2.5 w-2.5" /> Woo failed
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>
                          {l.changed_by_email || l.source || 'system'}
                        </span>
                        <span>{fmtDate(l.created_at)}</span>
                      </div>
                      {l.error_message && (
                        <p className="text-destructive">{l.error_message}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Separator />

            {/* Communication timeline */}
            <section>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <MessageCircle className="h-4 w-4" /> Communication Timeline
              </h3>

              {notifLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notifications sent yet.</p>
              ) : (
                <ul className="space-y-2">
                  {notifications.map((n) => {
                    const icon =
                      n.status === 'sent' ? '✅' : n.status === 'failed' ? '❌' : '⏳';
                    const canRetry = n.status === 'failed' || n.status === 'pending';
                    return (
                      <li
                        key={n.id}
                        className="rounded-md border border-border/50 p-2.5 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span aria-hidden>{icon}</span>
                            <Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0">
                              {n.status_trigger.replace(/_/g, ' ')}
                            </Badge>
                            <span className="text-muted-foreground capitalize">
                              WhatsApp · {n.status}
                            </span>
                            {n.provider && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                                {n.provider}
                              </Badge>
                            )}
                            {n.retry_count > 0 && (
                              <span className="text-muted-foreground">
                                · {n.retry_count} retries
                              </span>
                            )}
                          </div>
                          {canRetry && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px] gap-1"
                              disabled={retryingId === n.id}
                              onClick={() => retryOne(n.id)}
                            >
                              {retryingId === n.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <RefreshCw className="h-3 w-3" /> Retry
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="truncate">
                            {n.sent_at
                              ? `Sent ${fmtDate(n.sent_at)}`
                              : n.last_attempt_at
                                ? `Last attempt ${fmtDate(n.last_attempt_at)}`
                                : `Created ${fmtDate(n.created_at)}`}
                          </span>
                          {n.provider_message_id && (
                            <span className="font-mono truncate ml-2">
                              {n.provider_message_id.slice(0, 16)}…
                            </span>
                          )}
                        </div>
                        {n.error_message && (
                          <p className="text-destructive">{n.error_message}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, capitalize }: { label: string; value: string | null; capitalize?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`truncate ${capitalize ? 'capitalize' : ''}`}>{value || '—'}</p>
    </div>
  );
}
