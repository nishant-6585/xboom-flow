import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Order, PaymentStatus, OrderOutcome } from '@/hooks/useOrders';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { OrderNumberBadge } from '@/components/OrderNumberBadge';
import { PaymentStatusTracker } from '@/components/PaymentStatusTracker';
import { KycInviteBadge } from '@/components/orders/KycInviteBadge';
import { OrderConfirmationChip } from '@/components/orders/OrderConfirmationChip';
import { InvoiceAttachedBadge } from '@/components/orders/InvoiceAttachedBadge';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { Package, User, Building2, Truck, ExternalLink, TrendingUp, Clock, CreditCard, Trophy, XCircle, Undo2, IndianRupee, Calendar, ShoppingBag } from 'lucide-react';
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
  const canSeeProcurement = role === 'supply_chain' || role === 'admin' || role === 'finance';

  // Calculate profit (only visible to admin)
  const profit = order.selling_price && order.procurement_rate 
    ? (order.selling_price - order.procurement_rate) * order.quantity
    : null;

  const paymentConfig = paymentStatusConfig[order.payment_status];

  return (
    <Card 
      className="group cursor-pointer bg-gradient-to-br from-card via-card to-muted/10 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 border-border/60 hover:border-primary/30 overflow-hidden hover:-translate-y-1"
      onClick={onClick}
    >
      {/* Top accent bar based on status */}
      <div className={`h-1.5 w-full ${
        order.status === 'delivery_done' ? 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500' :
        order.status === 'in_transit' ? 'bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500' :
        order.status === 'cancelled' ? 'bg-gradient-to-r from-red-500 via-red-400 to-red-500' :
        'bg-gradient-to-r from-primary via-primary/80 to-primary'
      }`} />
      
      <CardContent className="p-5 space-y-4">
        {/* Header Section */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <OrderNumberBadge orderNumber={order.order_number} />
                {order.lead_source?.startsWith('shopify:') && (
                  <Badge variant="outline" className="text-xs border-green-400 text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400 h-5 px-1.5 gap-1">
                    <ShoppingBag className="h-3 w-3" />
                    Shopify
                  </Badge>
                )}
                {order.order_outcome && order.order_outcome !== 'pending' && (() => {
                  const config = outcomeConfig[order.order_outcome] ?? outcomeConfig.pending;
                  const IconComponent = config.icon;
                  return (
                    <Badge className={`${config.className} text-xs font-medium shadow-sm`}>
                      {IconComponent && <IconComponent className="h-3 w-3 mr-1" />}
                      {config.label}
                    </Badge>
                  );
                })()}
                {order.is_rto && (
                  <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 bg-orange-50 dark:bg-orange-950/30 shadow-sm">
                    <Undo2 className="h-3 w-3 mr-1" />
                    RTO
                  </Badge>
                )}
                <KycInviteBadge orderId={order.id} compact />
                <InvoiceAttachedBadge orderId={order.id} compact />
                <OrderConfirmationChip
                  orderId={order.id}
                  confirmationStatus={(order as any).confirmation_status}
                  requiresConfirmation={(order as any).requires_confirmation}
                  confirmedAt={(order as any).confirmed_at}
                />
              </div>
              <h3 className="font-semibold text-base leading-tight line-clamp-2 group-hover:text-primary transition-colors duration-200">
                {order.product_name}
              </h3>
            </div>
            <OrderStatusBadge status={order.status} />
          </div>
          
          {/* Category and Type Tags */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-xs font-medium bg-muted/70 hover:bg-muted transition-colors">
              {order.product_category}
            </Badge>
            <Badge variant="outline" className="text-xs font-medium border-border/70">
              {order.customer_type.toUpperCase()}
            </Badge>
            <Badge variant="outline" className="text-xs font-medium capitalize border-border/70">
              {order.order_type}
            </Badge>
          </div>
        </div>

        {/* Customer & Order Info */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <div className="flex items-center gap-2.5 text-sm">
            <div className="p-2 rounded-lg bg-muted/60">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">Qty:</span>
            <span className="font-semibold">{order.quantity}</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm min-w-0">
            <div className="p-2 rounded-lg bg-muted/60">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span className="truncate font-medium">{order.customer_name}</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm min-w-0 col-span-2">
            <div className="p-2 rounded-lg bg-muted/60">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span className="truncate text-muted-foreground">{order.customer_company}</span>
          </div>
          {order.committed_timeline && (
            <div className="flex items-center gap-2.5 text-sm col-span-2">
              <div className="p-2 rounded-lg bg-muted/60">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="text-muted-foreground">Timeline:</span>
              <span className="truncate font-medium">{order.committed_timeline}</span>
            </div>
          )}
        </div>

        {/* Sales Person - visible to supply chain and admin */}
        {canSeeProcurement && (
          <div className="flex items-center gap-2.5 text-sm bg-gradient-to-r from-muted/40 to-muted/20 rounded-xl px-4 py-2.5 border border-border/50">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Sales:</span>
            <span className="font-semibold">{order.sales_person_name}</span>
          </div>
        )}

        {/* Payment Section */}
        <div className="space-y-3 p-4 rounded-xl bg-gradient-to-br from-muted/40 via-muted/20 to-transparent border border-border/50 shadow-inner">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Badge className={`${paymentConfig.className} border shadow-sm`}>
              <CreditCard className="h-3 w-3 mr-1.5" />
              {paymentConfig.label}
            </Badge>
            {order.total_sales_amount && (
              <div className="flex items-center gap-1 text-sm font-bold">
                <IndianRupee className="h-4 w-4" />
                {order.total_sales_amount.toLocaleString('en-IN')}
              </div>
            )}
          </div>
          <PaymentStatusTracker orderId={order.id} compact />
        </div>

        {/* Tracking Info */}
        {(order.tracking_number || (order as any).courier_name || order.tracking_url) && (
          <div className="flex items-center gap-2.5 text-sm p-3 rounded-xl bg-gradient-to-r from-blue-50 to-blue-50/50 dark:from-blue-950/30 dark:to-blue-950/10 border border-blue-200/50 dark:border-blue-900/30 shadow-sm">
            <Truck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            {(order as any).courier_name && (
              <span className="font-semibold">{(order as any).courier_name}</span>
            )}
            {order.tracking_number && (
              <span className="text-muted-foreground">·</span>
            )}
            {order.tracking_url ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-blue-600 dark:text-blue-400 font-semibold hover:text-blue-700"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(order.tracking_url!, '_blank');
                }}
              >
                {order.tracking_number || 'Track shipment'}
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            ) : order.tracking_number ? (
              <span className="font-semibold">{order.tracking_number}</span>
            ) : null}
          </div>
        )}

        {/* Supplier & Procurement Info - visible to supply chain and admin */}
        {canSeeProcurement && order.supplier_name && (
          <div className="text-sm p-3 rounded-xl bg-gradient-to-r from-muted/50 to-muted/20 border border-border/50">
            <span className="text-muted-foreground">Supplier: </span>
            <span className="font-semibold">{order.supplier_name}</span>
            {order.procurement_rate && (
              <span className="ml-2 text-muted-foreground">
                @ ₹{order.procurement_rate.toLocaleString('en-IN')}
              </span>
            )}
          </div>
        )}

        {/* Profit - visible to supply chain and admin */}
        {canSeeProcurement && profit !== null && (
          <div className={`flex items-center justify-between p-3 rounded-xl border shadow-sm ${
            profit >= 0 
              ? 'bg-gradient-to-r from-emerald-50 to-emerald-50/50 dark:from-emerald-950/30 dark:to-emerald-950/10 border-emerald-200/50 dark:border-emerald-800/50' 
              : 'bg-gradient-to-r from-red-50 to-red-50/50 dark:from-red-950/30 dark:to-red-950/10 border-red-200/50 dark:border-red-800/50'
          }`}>
            <div className="flex items-center gap-2.5">
              <TrendingUp className={`h-4 w-4 ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
              <span className="text-sm text-muted-foreground font-medium">Profit</span>
            </div>
            <span className={`text-sm font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              ₹{profit.toLocaleString('en-IN')}
            </span>
          </div>
        )}

        {/* Footer with date */}
        <div className="flex items-center gap-2 pt-3 border-t border-border/50">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">
            Created {format(new Date(order.created_at), 'dd MMM yyyy, HH:mm')}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}