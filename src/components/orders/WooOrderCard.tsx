import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Package, User, IndianRupee, Clock, Truck } from 'lucide-react';
import type { WooCommerceOrder } from '@/hooks/useWooCommerceOrders';
import { WooOrderStatusActions } from './WooOrderStatusActions';

// Cast to allow optional tracking fields that may not yet exist on the WooCommerceOrder type
type OrderWithTracking = WooCommerceOrder & {
  tracking_status?: string | null;
  tracking_number?: string | null;
  courier?: string | null;
  expected_delivery?: string | null;
};

const statusColors: Record<string, string> = {
  completed: 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400',
  processing: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  pending: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  'on-hold': 'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  cancelled: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
  failed: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
  refunded: 'border-muted-foreground/40 bg-muted/30 text-muted-foreground',
};

const paymentColors: Record<string, string> = {
  paid: 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400',
  pending: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  failed: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
  refunded: 'border-muted-foreground/40 bg-muted/30 text-muted-foreground',
  cancelled: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
};

function getProductDisplay(order: WooCommerceOrder): string {
  const name = order.product_name;
  if (!name || name === 'Unknown Product' || name === 'Unknown') {
    return `Order #${order.order_number || order.woo_order_id}`;
  }
  return name;
}

function getCustomerDisplay(order: WooCommerceOrder): { name: string; subtitle: string | null } {
  const cName = order.customer_name;
  const email = order.customer_email;
  if (!cName || cName === 'Unknown' || cName === 'Unknown Customer') {
    return { name: email || `Order #${order.woo_order_id}`, subtitle: null };
  }
  return { name: cName, subtitle: email || null };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr).getTime();
    const diffMs = Date.now() - d;
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}

interface WooOrderCardProps {
  order: WooCommerceOrder;
  onClick?: (order: WooCommerceOrder) => void;
  onUpdated?: () => void;
}

export function WooOrderCard({ order, onClick, onUpdated }: WooOrderCardProps) {
  const product = getProductDisplay(order);
  const customer = getCustomerDisplay(order);
  const amount = order.total_sales_amount || order.selling_price || 0;
  const date = formatDate(order.woo_created_at || order.created_at);
  const updatedRel = formatRelative(order.woo_updated_at || order.updated_at);
  const statusClass = statusColors[order.order_status || ''] || statusColors.pending;
  const paymentClass = paymentColors[order.payment_status || ''] || paymentColors.pending;
  const o = order as OrderWithTracking;
  const tracking = o.tracking_status || null;
  const courier = o.courier || null;
  const trackingNumber = o.tracking_number || null;
  const hasTracking = Boolean(tracking || courier || trackingNumber);

  return (
    <Card
      className={`shadow-sm border-border/60 hover:shadow-lg hover:border-primary/20 transition-all duration-200 group ${
        onClick ? 'cursor-pointer' : ''
      }`}
      onClick={onClick ? () => onClick(order) : undefined}
    >
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-3 border-b border-border/30">
          <span className="font-mono text-sm font-bold text-primary">
            #{order.order_number || order.woo_order_id}
          </span>
          <Badge variant="outline" className={`text-[11px] capitalize font-medium px-2.5 py-0.5 ${statusClass}`}>
            {order.order_status || 'pending'}
          </Badge>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* Product */}
          <div className="flex items-start gap-2.5">
            <Package className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight truncate">{product}</p>
              {order.quantity > 1 && (
                <p className="text-xs text-muted-foreground mt-0.5">Qty: {order.quantity}</p>
              )}
            </div>
          </div>

          {/* Customer */}
          <div className="flex items-start gap-2.5">
            <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight truncate">{customer.name}</p>
              {customer.subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{customer.subtitle}</p>
              )}
            </div>
          </div>

          {/* Amount + Payment */}
          <div className="flex items-center justify-between pt-2 border-t border-border/30">
            <div className="flex items-center gap-1">
              <IndianRupee className="h-4 w-4 text-foreground" />
              <span className="text-lg font-bold tracking-tight">{amount.toLocaleString('en-IN')}</span>
            </div>
            <Badge variant="outline" className={`text-[11px] capitalize font-medium px-2 py-0.5 ${paymentClass}`}>
              {order.payment_status || 'pending'}
            </Badge>
          </div>

          {/* Date */}
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            {date && (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {date}
              </span>
            )}
            {updatedRel && (
              <span
                className="flex items-center gap-1.5"
                title={`Last updated: ${new Date(order.woo_updated_at || order.updated_at).toLocaleString('en-IN')}`}
              >
                <Clock className="h-3.5 w-3.5" />
                {updatedRel}
              </span>
            )}
          </div>

          {/* Tracking info */}
          {hasTracking && (
            <div className="flex items-start gap-2.5 pt-2 border-t border-border/30">
              <Truck className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1 space-y-0.5">
                {tracking && (
                  <p className="text-xs font-medium capitalize truncate">{tracking}</p>
                )}
                {(courier || trackingNumber) && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    {courier && <span>{courier}</span>}
                    {courier && trackingNumber && <span> · </span>}
                    {trackingNumber && <span className="font-mono">{trackingNumber}</span>}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Status update actions */}
          <div className="pt-2 border-t border-border/30">
            <WooOrderStatusActions
              wooOrderId={order.woo_order_id}
              currentStatus={order.order_status}
              variant="inline"
              onUpdated={onUpdated}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
