import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ArrowRight, History, AlertCircle, MessageCircle, RefreshCw, Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { WooCommerceOrder } from '@/hooks/useWooCommerceOrders';
import { WooOrderStatusActions } from './WooOrderStatusActions';
import { useOrderNotificationTimeline } from '@/hooks/useOrderNotification';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

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

export function WooOrderDetailDialog({ order, open, onOpenChange, onUpdated }: Props) {
  const [logs, setLogs] = useState<StatusLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  // Bumping this re-mounts the actions component so it picks up the new currentStatus
  const [actionsKey, setActionsKey] = useState(0);

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

            {/* Status update */}
            <section>
              <h3 className="text-sm font-semibold mb-3">Update Status</h3>
              <WooOrderStatusActions
                key={actionsKey}
                wooOrderId={order.woo_order_id}
                currentStatus={order.order_status}
                variant="full"
                onUpdated={() => {
                  setActionsKey((k) => k + 1);
                  onUpdated?.();
                }}
              />
            </section>

            <Separator />

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
