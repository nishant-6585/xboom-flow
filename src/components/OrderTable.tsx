import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Order, PaymentStatus, OrderOutcome, LostReason, LOST_REASONS } from '@/hooks/useOrders';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { Eye, MoreHorizontal, Trophy, XCircle, RotateCcw, Loader2 } from 'lucide-react';

interface OrderTableProps {
  orders: Order[];
  onOrderClick: (order: Order) => void;
  onUpdateOutcome?: (orderId: string, outcome: OrderOutcome, lostReason?: LostReason, lostReasonNotes?: string) => Promise<boolean>;
}

const paymentStatusConfig: Record<PaymentStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  partial: { label: 'Partial', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  full: { label: 'Paid', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
};

const outcomeConfig: Record<OrderOutcome, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' },
  won: { label: 'Won', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  lost: { label: 'Lost', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
};

export function OrderTable({ orders, onOrderClick, onUpdateOutcome }: OrderTableProps) {
  const { role } = useAuth();
  const canSeeProcurement = role === 'supply_chain' || role === 'admin';
  const canUpdateOutcome = role === 'sales' || role === 'admin';

  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState<LostReason>('price');
  const [lostReasonNotes, setLostReasonNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  const handleMarkWon = async (orderId: string) => {
    if (!onUpdateOutcome) return;
    setUpdating(true);
    await onUpdateOutcome(orderId, 'won');
    setUpdating(false);
  };

  const handleMarkLostClick = (orderId: string) => {
    setSelectedOrderId(orderId);
    setLostReason('price');
    setLostReasonNotes('');
    setLostDialogOpen(true);
  };

  const handleConfirmLost = async () => {
    if (!onUpdateOutcome || !selectedOrderId) return;
    setUpdating(true);
    const success = await onUpdateOutcome(selectedOrderId, 'lost', lostReason, lostReasonNotes);
    if (success) {
      setLostDialogOpen(false);
      setSelectedOrderId(null);
      setLostReason('price');
      setLostReasonNotes('');
    }
    setUpdating(false);
  };

  const handleResetOutcome = async (orderId: string) => {
    if (!onUpdateOutcome) return;
    setUpdating(true);
    await onUpdateOutcome(orderId, 'pending');
    setUpdating(false);
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-center">Qty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Outcome</TableHead>
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
                <TableCell colSpan={canSeeProcurement ? 12 : 8} className="text-center py-8 text-muted-foreground">
                  No orders found
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => {
                const profit = order.selling_price && order.procurement_rate 
                  ? (order.selling_price - order.procurement_rate) * order.quantity
                  : null;
                const paymentConfig = paymentStatusConfig[order.payment_status];
                const outcome = outcomeConfig[order.order_outcome || 'pending'];

                return (
                  <TableRow key={order.id} className="cursor-pointer" onClick={() => onOrderClick(order)}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{order.product_name}</div>
                        <div className="text-xs text-muted-foreground">{order.product_category}</div>
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
                    <TableCell>
                      <Badge className={outcome.className}>{outcome.label}</Badge>
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
                      <div className="flex items-center justify-center gap-1">
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
                        {canUpdateOutcome && onUpdateOutcome && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" disabled={updating}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              {order.order_outcome !== 'won' && (
                                <DropdownMenuItem onClick={() => handleMarkWon(order.id)}>
                                  <Trophy className="h-4 w-4 mr-2 text-green-600" />
                                  Mark as Won
                                </DropdownMenuItem>
                              )}
                              {order.order_outcome !== 'lost' && (
                                <DropdownMenuItem onClick={() => handleMarkLostClick(order.id)}>
                                  <XCircle className="h-4 w-4 mr-2 text-red-600" />
                                  Mark as Lost
                                </DropdownMenuItem>
                              )}
                              {order.order_outcome !== 'pending' && (
                                <DropdownMenuItem onClick={() => handleResetOutcome(order.id)}>
                                  <RotateCcw className="h-4 w-4 mr-2" />
                                  Reset to Pending
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Lost Reason Dialog */}
      <Dialog open={lostDialogOpen} onOpenChange={setLostDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Order as Lost</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for Loss</Label>
              <Select value={lostReason} onValueChange={(v) => setLostReason(v as LostReason)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOST_REASONS.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Additional Notes (Optional)</Label>
              <Textarea
                value={lostReasonNotes}
                onChange={(e) => setLostReasonNotes(e.target.value)}
                placeholder="Add any additional details..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLostDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmLost} 
              disabled={updating}
              className="bg-red-600 hover:bg-red-700"
            >
              {updating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Confirm Lost'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
