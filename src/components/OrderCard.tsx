import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Order, PaymentStatus, OrderOutcome } from '@/hooks/useOrders';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { OrderNumberBadge } from '@/components/OrderNumberBadge';
import { PaymentStatusTracker } from '@/components/PaymentStatusTracker';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { Package, User, Building2, Truck, ExternalLink, TrendingUp, Clock, CreditCard, Trophy, XCircle, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OrderCardProps {
  order: Order;
  onClick: () => void;
}

const paymentStatusConfig: Record<PaymentStatus, { label: string; className: string }> = {
  pending: { label: 'Payment Pending', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  partial: { label: 'Partial Received', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  full: { label: 'Paid in Full', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
};

const outcomeConfig: Record<OrderOutcome, { label: string; className: string; icon: React.ComponentType<{ className?: string }> | null }> = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400', icon: null },
  won: { label: 'Won', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: Trophy },
  lost: { label: 'Lost', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

export function OrderCard({ order, onClick }: OrderCardProps) {
  const { role } = useAuth();
  const canSeeProcurement = role === 'supply_chain' || role === 'admin';

  // Calculate profit (only visible to admin)
  const profit = order.selling_price && order.procurement_rate 
    ? (order.selling_price - order.procurement_rate) * order.quantity
    : null;

  const paymentConfig = paymentStatusConfig[order.payment_status];

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <OrderNumberBadge orderNumber={order.order_number} />
            </div>
            <CardTitle className="text-lg line-clamp-1">{order.product_name}</CardTitle>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">{order.product_category}</span>
          <Badge variant="outline" className="text-xs">
            {order.customer_type.toUpperCase()}
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">
            {order.order_type}
          </Badge>
          {order.order_outcome && order.order_outcome !== 'pending' && (() => {
            const config = outcomeConfig[order.order_outcome];
            const IconComponent = config.icon;
            return (
              <Badge className={config.className}>
                {IconComponent && <IconComponent className="h-3 w-3 mr-1" />}
                {config.label}
              </Badge>
            );
          })()}
          {order.is_rto && (
            <Badge variant="outline" className="text-xs border-orange-500 text-orange-600">
              <Undo2 className="h-3 w-3 mr-1" />
              RTO
            </Badge>
          )}
          {order.status === 'cancelled' && (
            <Badge variant="destructive" className="text-xs">
              <XCircle className="h-3 w-3 mr-1" />
              Cancelled
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Package className="h-4 w-4" />
            <span>Qty: {order.quantity}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-4 w-4" />
            <span className="truncate">{order.customer_name}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="h-4 w-4" />
            <span className="truncate">{order.customer_company}</span>
          </div>
          {order.committed_timeline && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="truncate">{order.committed_timeline}</span>
            </div>
          )}
        </div>

        {/* Sales Person - visible to supply chain and admin */}
        {canSeeProcurement && (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Sales:</span>
            <span className="font-medium">{order.sales_person_name}</span>
          </div>
        )}

        {/* Payment Info */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={paymentConfig.className}>
              <CreditCard className="h-3 w-3 mr-1" />
              {paymentConfig.label}
            </Badge>
            {order.total_sales_amount && (
              <span className="text-sm text-muted-foreground">
                ₹{order.total_sales_amount.toLocaleString('en-IN')}
              </span>
            )}
          </div>
          {/* Payment Records Status */}
          <PaymentStatusTracker orderId={order.id} compact />
        </div>

        {order.tracking_number && (
          <div className="flex items-center gap-2 text-sm">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Tracking:</span>
            {order.tracking_url ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(order.tracking_url!, '_blank');
                }}
              >
                {order.tracking_number}
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            ) : (
              <span>{order.tracking_number}</span>
            )}
          </div>
        )}

        {canSeeProcurement && order.supplier_name && (
          <div className="pt-2 border-t text-sm">
            <span className="text-muted-foreground">Supplier: </span>
            <span>{order.supplier_name}</span>
            {order.procurement_rate && (
              <span className="ml-2 text-muted-foreground">
                @ ₹{order.procurement_rate.toLocaleString('en-IN')}
              </span>
            )}
          </div>
        )}

        {/* Profit - visible to supply chain and admin */}
        {canSeeProcurement && profit !== null && (
          <div className="pt-2 border-t flex items-center gap-2">
            <TrendingUp className={`h-4 w-4 ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
            <span className="text-sm text-muted-foreground">Profit:</span>
            <span className={`text-sm font-semibold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ₹{profit.toLocaleString('en-IN')}
            </span>
          </div>
        )}

        <div className="text-xs text-muted-foreground pt-2 border-t">
          Created {format(new Date(order.created_at), 'dd MMM yyyy, HH:mm')}
        </div>
      </CardContent>
    </Card>
  );
}
