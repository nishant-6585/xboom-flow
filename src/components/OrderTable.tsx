import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Order, PaymentStatus, OrderOutcome, LostReason, LOST_REASONS } from '@/hooks/useOrders';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { OrderNumberBadge } from '@/components/OrderNumberBadge';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { Eye, MoreHorizontal, Trophy, XCircle, RotateCcw, Loader2, Undo2, IndianRupee, TrendingUp, TrendingDown, ShoppingBag, CheckCircle2, Download, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTableExport } from '@/hooks/useTableExport';

interface OrderTableProps {
  orders: Order[];
  onOrderClick: (order: Order) => void;
  onUpdateOutcome?: (orderId: string, outcome: OrderOutcome, lostReason?: LostReason, lostReasonNotes?: string) => Promise<boolean>;
}

const paymentStatusConfig: Record<PaymentStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200/50' },
  partial: { label: 'Partial', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200/50' },
  full: { label: 'Paid', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200/50' },
};

const outcomeConfig: Record<OrderOutcome, { label: string; className: string; icon: React.ComponentType<{ className?: string }> | null }> = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400', icon: null },
  won: { label: 'Won', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400', icon: Trophy },
  lost: { label: 'Lost', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

export function OrderTable({ orders, onOrderClick, onUpdateOutcome }: OrderTableProps) {
  const { role } = useAuth();
  const canSeeProcurement = role === 'supply_chain' || role === 'admin' || role === 'finance';
  const canUpdateOutcome = role === 'sales' || role === 'admin';
  const canBulkMarkPaid = role === 'admin' || role === 'finance';
  const { exportToExcel } = useTableExport();

  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState<LostReason>('price');
  const [lostReasonNotes, setLostReasonNotes] = useState('');
  const [updating, setUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const visibleIds = useMemo(() => orders.map(o => o.id), [orders]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some(id => selectedIds.has(id)) && !allVisibleSelected;

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedOrders = useMemo(
    () => orders.filter(o => selectedIds.has(o.id)),
    [orders, selectedIds],
  );
  const markableOrders = selectedOrders.filter(o => o.payment_status !== 'full');

  const handleBulkMarkPaid = async () => {
    if (markableOrders.length === 0) return;
    setBulkBusy(true);
    const ids = markableOrders.map(o => o.id);
    const { error } = await supabase
      .from('orders')
      .update({ payment_status: 'full' })
      .in('id', ids);
    setBulkBusy(false);
    if (error) {
      toast.error('Failed to update payment status', { description: error.message });
      return;
    }
    toast.success(`Marked ${ids.length} order${ids.length === 1 ? '' : 's'} as paid`);
    clearSelection();
  };

  const handleExportSelected = () => {
    if (selectedOrders.length === 0) return;
    const rows = selectedOrders.map(o => ({
      order_number: o.order_number,
      order_date: (o as any).order_date || o.created_at,
      customer_name: o.customer_name,
      customer_company: o.customer_company,
      product_name: o.product_name,
      product_category: o.product_category,
      quantity: o.quantity,
      status: o.status,
      payment_status: o.payment_status,
      order_outcome: o.order_outcome,
      supplier_name: o.supplier_name,
      selling_price: o.selling_price,
      procurement_rate: o.procurement_rate,
      total: (o.selling_price ?? 0) * o.quantity,
    }));
    exportToExcel(rows, 'orders-selected', {
      sheetName: 'Orders',
      amountColumns: ['selling_price', 'procurement_rate', 'total'],
      dateColumns: ['order_date'],
      headers: {
        order_number: 'Order #',
        order_date: 'Order Date',
        customer_name: 'Customer',
        customer_company: 'Company',
        product_name: 'Product',
        product_category: 'Category',
        quantity: 'Qty',
        status: 'Status',
        payment_status: 'Payment',
        order_outcome: 'Outcome',
        supplier_name: 'Supplier',
        selling_price: 'Selling Price',
        procurement_rate: 'Procurement Rate',
        total: 'Total Value',
      },
    });
  };

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
      <div className="rounded-lg border-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-8">
                <Checkbox
                  checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                  onCheckedChange={toggleAllVisible}
                  aria-label="Select all orders on this page"
                />
              </TableHead>
              <TableHead className="font-semibold">Order No</TableHead>
              <TableHead className="font-semibold">Order Date</TableHead>
              <TableHead className="font-semibold">Product</TableHead>
              <TableHead className="font-semibold">Customer</TableHead>
              <TableHead className="font-semibold text-center">Qty</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Payment</TableHead>
              <TableHead className="font-semibold">Outcome</TableHead>
              {canSeeProcurement && <TableHead className="font-semibold">Supplier</TableHead>}
              {canSeeProcurement && <TableHead className="font-semibold text-right">Selling</TableHead>}
              {canSeeProcurement && <TableHead className="font-semibold text-right">Procurement</TableHead>}
              {canSeeProcurement && <TableHead className="font-semibold text-right">Profit</TableHead>}
              <TableHead className="font-semibold">Created</TableHead>
              <TableHead className="font-semibold text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canSeeProcurement ? 15 : 11} className="text-center py-12 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <div className="p-3 rounded-full bg-muted">
                      <Eye className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p>No orders found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order, index) => {
                const profit = order.selling_price && order.procurement_rate 
                  ? (order.selling_price - order.procurement_rate) * order.quantity
                  : null;
                const paymentConfig = paymentStatusConfig[order.payment_status] ?? paymentStatusConfig.pending;
                const outcome = outcomeConfig[order.order_outcome || 'pending'] ?? outcomeConfig.pending;
                const OutcomeIcon = outcome.icon;
                const isSelected = selectedIds.has(order.id);

                return (
                  <TableRow 
                    key={order.id} 
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${isSelected ? 'bg-primary/5' : index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}
                    onClick={() => onOrderClick(order)}
                  >
                    <TableCell className="w-8" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(order.id)}
                        aria-label={`Select order ${order.order_number}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <OrderNumberBadge orderNumber={order.order_number} />
                        {order.lead_source?.startsWith('shopify:') && (
                          <Badge variant="outline" className="text-xs border-green-400 text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400 h-5 px-1.5 gap-1">
                            <ShoppingBag className="h-3 w-3" />
                            Shopify
                          </Badge>
                        )}
                        {order.is_rto && (
                          <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 bg-orange-50 dark:bg-orange-950/30 h-5 px-1">
                            <Undo2 className="h-3 w-3" />
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm whitespace-nowrap">
                        {format(new Date((order as any).order_date || order.created_at), 'dd MMM yyyy')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <div className="font-medium truncate">{order.product_name}</div>
                        <div className="text-xs text-muted-foreground truncate">{order.product_category}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[150px]">
                        <div className="font-medium truncate">{order.customer_name}</div>
                        <div className="text-xs text-muted-foreground truncate">{order.customer_company}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="font-mono">{order.quantity}</Badge>
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>
                      <Badge className={`${paymentConfig.className} border`}>{paymentConfig.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={outcome.className}>
                        {OutcomeIcon && <OutcomeIcon className="h-3 w-3 mr-1" />}
                        {outcome.label}
                      </Badge>
                    </TableCell>
                    {canSeeProcurement && (
                      <TableCell>
                        <span className="truncate max-w-[120px] block">
                          {order.supplier_name || <span className="text-muted-foreground">—</span>}
                        </span>
                      </TableCell>
                    )}
                    {canSeeProcurement && (
                      <TableCell className="text-right">
                        {order.selling_price ? (
                          <span className="font-medium flex items-center justify-end gap-0.5">
                            <IndianRupee className="h-3 w-3" />
                            {order.selling_price.toLocaleString('en-IN')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    {canSeeProcurement && (
                      <TableCell className="text-right">
                        {order.procurement_rate ? (
                          <span className="text-muted-foreground flex items-center justify-end gap-0.5">
                            <IndianRupee className="h-3 w-3" />
                            {order.procurement_rate.toLocaleString('en-IN')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    {canSeeProcurement && (
                      <TableCell className="text-right">
                        {profit !== null ? (
                          <span className={`font-semibold flex items-center justify-end gap-1 ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {profit >= 0 ? (
                              <TrendingUp className="h-3.5 w-3.5" />
                            ) : (
                              <TrendingDown className="h-3.5 w-3.5" />
                            )}
                            ₹{Math.abs(profit).toLocaleString('en-IN')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(order.created_at), 'dd MMM yyyy')}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
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
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={updating}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
                              {order.order_outcome !== 'won' && (
                                <DropdownMenuItem 
                                  onClick={() => handleMarkWon(order.id)}
                                  className="text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50 dark:focus:bg-emerald-950/30"
                                >
                                  <Trophy className="h-4 w-4 mr-2" />
                                  Mark as Won
                                </DropdownMenuItem>
                              )}
                              {order.order_outcome !== 'lost' && (
                                <DropdownMenuItem 
                                  onClick={() => handleMarkLostClick(order.id)}
                                  className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30"
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Mark as Lost
                                </DropdownMenuItem>
                              )}
                              {order.order_outcome !== 'pending' && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleResetOutcome(order.id)}>
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    Reset to Pending
                                  </DropdownMenuItem>
                                </>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-950/30">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              Mark Order as Lost
            </DialogTitle>
            <DialogDescription>
              Please provide the reason for losing this order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Reason for Loss</Label>
              <Select value={lostReason} onValueChange={(v) => setLostReason(v as LostReason)}>
                <SelectTrigger className="bg-background">
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
              <Label className="text-sm font-medium">Additional Notes <span className="text-muted-foreground font-normal">(Optional)</span></Label>
              <Textarea
                value={lostReasonNotes}
                onChange={(e) => setLostReasonNotes(e.target.value)}
                placeholder="Add any additional details about why the order was lost..."
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setLostDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmLost} 
              disabled={updating}
              variant="destructive"
              className="gap-2"
            >
              {updating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  Confirm Lost
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating bulk-action toolbar */}
      {selectedIds.size > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk order actions"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border bg-card/95 backdrop-blur px-4 py-2 shadow-lg"
        >
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <div className="h-5 w-px bg-border mx-1" />
          {canBulkMarkPaid && (
            <Button
              size="sm"
              variant="default"
              onClick={handleBulkMarkPaid}
              disabled={bulkBusy || markableOrders.length === 0}
              className="gap-1.5"
            >
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Mark Paid ({markableOrders.length})
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleExportSelected} className="gap-1.5">
            <Download className="h-4 w-4" />
            Export selected
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection} className="gap-1.5">
            <X className="h-4 w-4" />
            Clear
          </Button>
        </div>
      )}
    </>
  );
}