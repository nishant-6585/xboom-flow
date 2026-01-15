import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Order, PaymentStatus, OrderOutcome } from '@/hooks/useOrders';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { OrderNumberBadge } from '@/components/OrderNumberBadge';
import { PaymentStatusTracker } from '@/components/PaymentStatusTracker';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { Package, User, Building2, Truck, ExternalLink, TrendingUp, Clock, CreditCard, Trophy, XCircle, Undo2, IndianRupee, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OrderCardProps {
  order: Order;
  onClick: () => void;
}

const paymentStatusConfig: Record<PaymentStatus, { label: string; className: string }> = {
  pending: { label: 'Payment Pending', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200/50' },
  partial: { label: 'Partial Received', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200/50' },
  full: { label: 'Paid in Full', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200/50' },
};

const outcomeConfig: Record<OrderOutcome, { label: string; className: string; icon: React.ComponentType<{ className?: string }> | null }> = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400', icon: null },
  won: { label: 'Won', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400', icon: Trophy },
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
      className="group cursor-pointer bg-gradient-to-br from-background to-muted/20 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 border-muted/50 hover:border-primary/20 overflow-hidden"
      onClick={onClick}
    >
      {/* Top accent bar based on status */}
      <div className={`h-1 w-full ${
        order.status === 'delivery_done' ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' :
        order.status === 'in_transit' ? 'bg-gradient-to-r from-blue-500 to-blue-400' :
        order.status === 'cancelled' ? 'bg-gradient-to-r from-red-500 to-red-400' :
        'bg-gradient-to-r from-primary/60 to-primary/40'
      }`} />
      
      <CardContent className="p-4 space-y-4">
        {/* Header Section */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <OrderNumberBadge orderNumber={order.order_number} />
                {order.order_outcome && order.order_outcome !== 'pending' && (() => {
                  const config = outcomeConfig[order.order_outcome];
                  const IconComponent = config.icon;
                  return (
                    <Badge className={`${config.className} text-xs`}>
                      {IconComponent && <IconComponent className="h-3 w-3 mr-1" />}
                      {config.label}
                    </Badge>
                  );
                })()}
                {order.is_rto && (
                  <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 bg-orange-50 dark:bg-orange-950/30">
                    <Undo2 className="h-3 w-3 mr-1" />
                    RTO
                  </Badge>
                )}
              </div>
              <h3 className="font-semibold text-base leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                {order.product_name}
              </h3>
            </div>
            <OrderStatusBadge status={order.status} />
          </div>
          
          {/* Category and Type Tags */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="secondary" className="text-xs font-normal bg-muted/50">
              {order.product_category}
            </Badge>
            <Badge variant="outline" className="text-xs font-normal">
              {order.customer_type.toUpperCase()}
            </Badge>
            <Badge variant="outline" className="text-xs font-normal capitalize">
              {order.order_type}
            </Badge>
          </div>
        </div>

        {/* Customer & Order Info */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div className="flex items-center gap-2 text-sm">
            <div className="p-1.5 rounded-md bg-muted/50">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">Qty:</span>
            <span className="font-medium">{order.quantity}</span>
          </div>
          <div className="flex items-center gap-2 text-sm min-w-0">
            <div className="p-1.5 rounded-md bg-muted/50">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span className="truncate font-medium">{order.customer_name}</span>
          </div>
          <div className="flex items-center gap-2 text-sm min-w-0 col-span-2">
            <div className="p-1.5 rounded-md bg-muted/50">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span className="truncate text-muted-foreground">{order.customer_company}</span>
          </div>
          {order.committed_timeline && (
            <div className="flex items-center gap-2 text-sm col-span-2">
              <div className="p-1.5 rounded-md bg-muted/50">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="text-muted-foreground">Timeline:</span>
              <span className="truncate">{order.committed_timeline}</span>
            </div>
          )}
        </div>

        {/* Sales Person - visible to supply chain and admin */}
        {canSeeProcurement && (
          <div className="flex items-center gap-2 text-sm bg-muted/30 rounded-lg px-3 py-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Sales:</span>
            <span className="font-medium">{order.sales_person_name}</span>
          </div>
        )}

        {/* Payment Section */}
        <div className="space-y-2 p-3 rounded-lg bg-gradient-to-br from-muted/30 to-muted/10 border border-muted/50">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Badge className={`${paymentConfig.className} border`}>
              <CreditCard className="h-3 w-3 mr-1.5" />
              {paymentConfig.label}
            </Badge>
            {order.total_sales_amount && (
              <div className="flex items-center gap-1 text-sm font-semibold">
                <IndianRupee className="h-3.5 w-3.5" />
                {order.total_sales_amount.toLocaleString('en-IN')}
              </div>
            )}
          </div>
          <PaymentStatusTracker orderId={order.id} compact />
        </div>

        {/* Tracking Info */}
        {order.tracking_number && (
          <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
            <Truck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-muted-foreground">Tracking:</span>
            {order.tracking_url ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-blue-600 dark:text-blue-400 font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(order.tracking_url!, '_blank');
                }}
              >
                {order.tracking_number}
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            ) : (
              <span className="font-medium">{order.tracking_number}</span>
            )}
          </div>
        )}

        {/* Supplier & Procurement Info - visible to supply chain and admin */}
        {canSeeProcurement && order.supplier_name && (
          <div className="text-sm p-2 rounded-lg bg-muted/30 border border-muted/50">
            <span className="text-muted-foreground">Supplier: </span>
            <span className="font-medium">{order.supplier_name}</span>
            {order.procurement_rate && (
              <span className="ml-2 text-muted-foreground">
                @ ₹{order.procurement_rate.toLocaleString('en-IN')}
              </span>
            )}
          </div>
        )}

        {/* Profit - visible to supply chain and admin */}
        {canSeeProcurement && profit !== null && (
          <div className={`flex items-center justify-between p-2.5 rounded-lg border ${
            profit >= 0 
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200/50 dark:border-emerald-800/50' 
              : 'bg-red-50 dark:bg-red-950/20 border-red-200/50 dark:border-red-800/50'
          }`}>
            <div className="flex items-center gap-2">
              <TrendingUp className={`h-4 w-4 ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
              <span className="text-sm text-muted-foreground">Profit</span>
            </div>
            <span className={`text-sm font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              ₹{profit.toLocaleString('en-IN')}
            </span>
          </div>
        )}

        {/* Footer with date */}
        <div className="flex items-center gap-2 pt-2 border-t border-muted/50">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Created {format(new Date(order.created_at), 'dd MMM yyyy, HH:mm')}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}