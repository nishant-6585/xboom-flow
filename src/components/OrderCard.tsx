import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Order } from '@/hooks/useOrders';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { Package, User, Building2, Truck, Calendar, ExternalLink, TrendingUp, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OrderCardProps {
  order: Order;
  onClick: () => void;
}

export function OrderCard({ order, onClick }: OrderCardProps) {
  const { role } = useAuth();
  const canSeeProcurement = role === 'supply_chain' || role === 'admin';
  const isAdmin = role === 'admin';

  // Calculate profit (only visible to admin)
  const profit = order.selling_price && order.procurement_rate 
    ? (order.selling_price - order.procurement_rate) * order.quantity
    : null;

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg line-clamp-1">{order.product_name}</CardTitle>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-sm text-muted-foreground">{order.product_code} • {order.product_category}</p>
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
          {order.estimated_delivery && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{format(new Date(order.estimated_delivery), 'dd MMM yyyy')}</span>
            </div>
          )}
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

        {/* Admin-only: Show profit */}
        {isAdmin && profit !== null && (
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
