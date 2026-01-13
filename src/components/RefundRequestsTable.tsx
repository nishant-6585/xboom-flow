import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Order, RefundStatus, REFUND_STATUSES } from '@/hooks/useOrders';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { RotateCcw, Package, Loader2, XCircle, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

interface RefundRequestsTableProps {
  orders: Order[];
  onUpdateOrder: (orderId: string, updates: Partial<Order>) => Promise<boolean>;
}

const refundStatusConfig: Record<RefundStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  approved: { label: 'Approved', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  done: { label: 'Done', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
};

export function RefundRequestsTable({ orders, onUpdateOrder }: RefundRequestsTableProps) {
  const { role } = useAuth();
  const [updating, setUpdating] = useState<string | null>(null);
  
  const canUpdateRefund = role === 'admin';
  
  // Include both refund requested orders AND cancelled orders
  const refundOrders = orders.filter(o => o.is_refund_requested || o.status === 'cancelled');

  const handleStatusChange = async (orderId: string, newStatus: RefundStatus) => {
    setUpdating(orderId);
    const success = await onUpdateOrder(orderId, { refund_status: newStatus });
    if (success) {
      toast.success('Refund status updated');
    }
    setUpdating(null);
  };

  if (refundOrders.length === 0) {
    return (
      <div className="text-center py-12">
        <RotateCcw className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No refund requests</h3>
        <p className="text-muted-foreground">There are no refund requests or cancelled orders at this time.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Requested At</TableHead>
            <TableHead>Status</TableHead>
            {canUpdateRefund && <TableHead>Action</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {refundOrders.map((order) => {
            const statusConfig = order.refund_status ? refundStatusConfig[order.refund_status] : refundStatusConfig.pending;
            const isCancelled = order.status === 'cancelled';
            const isRto = order.is_rto;
            const reason = isCancelled ? order.cancellation_reason : order.refund_reason;
            const requestedAt = isCancelled ? order.cancelled_at : order.refund_requested_at;
            
            return (
              <TableRow key={order.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="font-medium">{order.product_name}</span>
                      <p className="text-xs text-muted-foreground">{order.product_category}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <span className="font-medium">{order.customer_name}</span>
                    <p className="text-xs text-muted-foreground">{order.customer_company}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {isCancelled && (
                      <Badge variant="destructive" className="text-xs flex items-center gap-1 w-fit">
                        <XCircle className="h-3 w-3" />
                        Cancelled
                      </Badge>
                    )}
                    {isRto && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1 w-fit border-orange-500 text-orange-600">
                        <Undo2 className="h-3 w-3" />
                        RTO
                      </Badge>
                    )}
                    {!isCancelled && !isRto && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1 w-fit">
                        <RotateCcw className="h-3 w-3" />
                        Refund
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <p className="text-sm max-w-xs truncate" title={reason || ''}>
                    {reason || '-'}
                  </p>
                </TableCell>
                <TableCell>
                  {requestedAt 
                    ? format(new Date(requestedAt), 'dd MMM yyyy, HH:mm')
                    : '-'
                  }
                </TableCell>
                <TableCell>
                  <Badge className={statusConfig.className}>
                    {statusConfig.label}
                  </Badge>
                </TableCell>
                {canUpdateRefund && (
                  <TableCell>
                    {updating === order.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Select
                        value={order.refund_status || 'pending'}
                        onValueChange={(v) => handleStatusChange(order.id, v as RefundStatus)}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REFUND_STATUSES.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
