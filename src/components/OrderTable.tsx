import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Order, PaymentStatus } from '@/hooks/useOrders';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { ExternalLink, Eye } from 'lucide-react';

interface OrderTableProps {
  orders: Order[];
  onOrderClick: (order: Order) => void;
}

const paymentStatusConfig: Record<PaymentStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  partial: { label: 'Partial', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  full: { label: 'Paid', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
};

export function OrderTable({ orders, onOrderClick }: OrderTableProps) {
  const { role } = useAuth();
  const canSeeProcurement = role === 'supply_chain' || role === 'admin';

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead className="text-center">Qty</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Payment</TableHead>
            {canSeeProcurement && <TableHead>Supplier</TableHead>}
            {canSeeProcurement && <TableHead className="text-right">Selling Price</TableHead>}
            {canSeeProcurement && <TableHead className="text-right">Procurement</TableHead>}
            {canSeeProcurement && <TableHead className="text-right">Profit</TableHead>}
            <TableHead>Created</TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canSeeProcurement ? 11 : 7} className="text-center py-8 text-muted-foreground">
                No orders found
              </TableCell>
            </TableRow>
          ) : (
            orders.map((order) => {
              const profit = order.selling_price && order.procurement_rate 
                ? (order.selling_price - order.procurement_rate) * order.quantity
                : null;
              const paymentConfig = paymentStatusConfig[order.payment_status];

              return (
                <TableRow key={order.id} className="cursor-pointer" onClick={() => onOrderClick(order)}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{order.product_name}</div>
                      <div className="text-xs text-muted-foreground">{order.product_code}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{order.customer_name}</div>
                      <div className="text-xs text-muted-foreground">{order.customer_company}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{order.quantity}</TableCell>
                  <TableCell>
                    <OrderStatusBadge status={order.status} />
                  </TableCell>
                  <TableCell>
                    <Badge className={paymentConfig.className}>{paymentConfig.label}</Badge>
                  </TableCell>
                  {canSeeProcurement && (
                    <TableCell>
                      {order.supplier_name || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                  )}
                  {canSeeProcurement && (
                    <TableCell className="text-right">
                      {order.selling_price 
                        ? `₹${order.selling_price.toLocaleString('en-IN')}`
                        : <span className="text-muted-foreground">-</span>
                      }
                    </TableCell>
                  )}
                  {canSeeProcurement && (
                    <TableCell className="text-right">
                      {order.procurement_rate 
                        ? `₹${order.procurement_rate.toLocaleString('en-IN')}`
                        : <span className="text-muted-foreground">-</span>
                      }
                    </TableCell>
                  )}
                  {canSeeProcurement && (
                    <TableCell className="text-right">
                      {profit !== null ? (
                        <span className={profit >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                          ₹{profit.toLocaleString('en-IN')}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(order.created_at), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOrderClick(order);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
