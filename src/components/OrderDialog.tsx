import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Order, OrderStatus, ORDER_STATUSES, PaymentStatus, PAYMENT_STATUSES, OrderType, ORDER_TYPES, CustomerType, CUSTOMER_TYPES } from '@/hooks/useOrders';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { PaymentRecordsList } from '@/components/PaymentRecordsList';
import { PaymentUploadDialog } from '@/components/PaymentUploadDialog';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { Loader2, Package, User, Building2, Truck, Calendar, ExternalLink, Trash2, TrendingUp, Clock, CreditCard, MapPin, Upload } from 'lucide-react';

interface OrderDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (orderId: string, updates: Partial<Order>) => Promise<boolean>;
  onDelete: (orderId: string) => Promise<boolean>;
}

const paymentStatusConfig: Record<PaymentStatus, { label: string; className: string }> = {
  pending: { label: 'Payment Pending', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  partial: { label: 'Partial Received', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  full: { label: 'Paid in Full', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
};

export function OrderDialog({ order, open, onOpenChange, onUpdate, onDelete }: OrderDialogProps) {
  const { role } = useAuth();
  const canEdit = role === 'supply_chain' || role === 'admin';
  const canDelete = role === 'admin';
  const canSeeProcurement = role === 'supply_chain' || role === 'admin';
  const isAdmin = role === 'admin';

  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentUploadOpen, setPaymentUploadOpen] = useState(false);

  const [status, setStatus] = useState<OrderStatus>('pending');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [orderType, setOrderType] = useState<OrderType>('prepaid');
  const [customerType, setCustomerType] = useState<CustomerType>('b2b');
  const [shippingAddress, setShippingAddress] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [procurementRate, setProcurementRate] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [totalSalesAmount, setTotalSalesAmount] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [committedTimeline, setCommittedTimeline] = useState('');
  const [estimatedDelivery, setEstimatedDelivery] = useState('');
  const [actualDelivery, setActualDelivery] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [salesNotes, setSalesNotes] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState('');

  useEffect(() => {
    if (order) {
      setStatus(order.status);
      setPaymentStatus(order.payment_status);
      setOrderType(order.order_type);
      setCustomerType(order.customer_type);
      setShippingAddress(order.shipping_address || '');
      setSupplierName(order.supplier_name || '');
      setSupplierContact(order.supplier_contact || '');
      setProcurementRate(order.procurement_rate?.toString() || '');
      setSellingPrice(order.selling_price?.toString() || '');
      setTotalSalesAmount(order.total_sales_amount?.toString() || '');
      setAmountPaid(order.amount_paid?.toString() || '');
      setPaymentTerms(order.payment_terms || '');
      setTrackingNumber(order.tracking_number || '');
      setTrackingUrl(order.tracking_url || '');
      setCommittedTimeline(order.committed_timeline || '');
      setEstimatedDelivery(order.estimated_delivery || '');
      setActualDelivery(order.actual_delivery || '');
      setInternalNotes(order.internal_notes || '');
      setCustomerNotes(order.customer_notes || '');
      setSalesNotes(order.sales_notes || '');
      setPaymentDueDate(order.payment_due_date || '');
    }
  }, [order]);

  if (!order) return null;

  // Calculate profit (only visible to admin)
  const profit = order.selling_price && order.procurement_rate 
    ? (order.selling_price - order.procurement_rate) * order.quantity
    : null;

  const balanceAmount = order.total_sales_amount && order.amount_paid !== null
    ? order.total_sales_amount - (order.amount_paid || 0)
    : null;

  const handleUpdate = async () => {
    setLoading(true);
    const success = await onUpdate(order.id, {
      status,
      payment_status: paymentStatus,
      order_type: orderType,
      customer_type: customerType,
      shipping_address: shippingAddress || null,
      supplier_name: supplierName || null,
      supplier_contact: supplierContact || null,
      procurement_rate: procurementRate ? parseFloat(procurementRate) : null,
      selling_price: sellingPrice ? parseFloat(sellingPrice) : null,
      total_sales_amount: totalSalesAmount ? parseFloat(totalSalesAmount) : null,
      amount_paid: amountPaid ? parseFloat(amountPaid) : null,
      payment_terms: paymentTerms || null,
      payment_due_date: paymentDueDate || null,
      tracking_number: trackingNumber || null,
      tracking_url: trackingUrl || null,
      committed_timeline: committedTimeline || null,
      estimated_delivery: estimatedDelivery || null,
      actual_delivery: actualDelivery || null,
      internal_notes: internalNotes || null,
      customer_notes: customerNotes || null,
      sales_notes: salesNotes || null,
    });
    setLoading(false);
    if (success) {
      onOpenChange(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    const success = await onDelete(order.id);
    setLoading(false);
    if (success) {
      setDeleteDialogOpen(false);
      onOpenChange(false);
    }
  };

  const paymentConfig = paymentStatusConfig[order.payment_status];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  {order.product_name}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2 mt-1">
                  {order.product_category}
                  <Badge variant="outline" className="text-xs">
                    {order.customer_type.toUpperCase()}
                  </Badge>
                  <Badge variant="outline" className="text-xs capitalize">
                    {order.order_type}
                  </Badge>
                </DialogDescription>
              </div>
              <OrderStatusBadge status={order.status} />
            </div>
          </DialogHeader>

          <div className="space-y-6">
            {/* Order Details */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Quantity:</span>
                <span className="font-medium">{order.quantity}</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-medium">{order.customer_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Company:</span>
                <span className="font-medium">{order.customer_company}</span>
              </div>
              {canSeeProcurement && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Sales:</span>
                  <span className="font-medium">{order.sales_person_name}</span>
                </div>
              )}
              {order.committed_timeline && (
                <div className="flex items-center gap-2 col-span-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Committed Timeline:</span>
                  <span className="font-medium">{order.committed_timeline}</span>
                </div>
              )}
            </div>

            {/* Shipping Address */}
            {order.shipping_address && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <span className="text-muted-foreground">Shipping Address:</span>
                    <p className="font-medium mt-1">{order.shipping_address}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Info */}
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  <span className="font-medium">Payment Information</span>
                  <Badge className={paymentConfig.className}>
                    {paymentConfig.label}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPaymentUploadOpen(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Payment
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {order.total_sales_amount !== null && (
                  <div>
                    <span className="text-muted-foreground">Total Amount:</span>
                    <p className="font-medium">₹{order.total_sales_amount?.toLocaleString('en-IN')}</p>
                  </div>
                )}
                {order.amount_paid !== null && (
                  <div>
                    <span className="text-muted-foreground">Paid:</span>
                    <p className="font-medium text-green-600">₹{order.amount_paid?.toLocaleString('en-IN')}</p>
                  </div>
                )}
                {balanceAmount !== null && balanceAmount > 0 && (
                  <div>
                    <span className="text-muted-foreground">Balance:</span>
                    <p className="font-medium text-orange-600">₹{balanceAmount?.toLocaleString('en-IN')}</p>
                  </div>
                )}
                {order.payment_terms && (
                  <div className="col-span-2 md:col-span-4">
                    <span className="text-muted-foreground">Terms:</span>
                    <p className="font-medium">{order.payment_terms}</p>
                  </div>
                )}
              </div>

              {/* Payment Records */}
              <div className="pt-3 border-t border-border">
                <h5 className="text-sm font-medium mb-2">Payment Records</h5>
                <PaymentRecordsList orderId={order.id} />
              </div>
            </div>

            {/* Admin-only: Profit Display */}
            {isAdmin && profit !== null && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-green-800 dark:text-green-300">Profit</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Procurement:</span>
                    <p className="font-medium">₹{order.procurement_rate?.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Selling:</span>
                    <p className="font-medium">₹{order.selling_price?.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Profit:</span>
                    <p className={`font-bold text-lg ${profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      ₹{profit.toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Tracking Info */}
            {(order.tracking_number || order.estimated_delivery) && (
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Tracking Information
                </h4>
                {order.tracking_number && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Tracking Number:</span>
                    {order.tracking_url ? (
                      <a
                        href={order.tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        {order.tracking_number}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span>{order.tracking_number}</span>
                    )}
                  </div>
                )}
                {order.estimated_delivery && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Est. Delivery:</span>
                    <span>{format(new Date(order.estimated_delivery), 'dd MMM yyyy')}</span>
                  </div>
                )}
                {order.actual_delivery && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Delivered:</span>
                    <span>{format(new Date(order.actual_delivery), 'dd MMM yyyy')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            {(order.sales_notes || order.customer_notes) && (
              <div className="space-y-3">
                {order.sales_notes && (
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Sales Notes</Label>
                    <p className="text-sm p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">{order.sales_notes}</p>
                  </div>
                )}
                {order.customer_notes && (
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Customer Notes</Label>
                    <p className="text-sm p-3 bg-muted/50 rounded-lg">{order.customer_notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Edit Form (Supply Chain / Admin only) */}
            {canEdit && (
              <div className="space-y-4 border-t pt-4">
                <h4 className="font-medium">Update Order</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="status">Order Status</Label>
                    <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORDER_STATUSES.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment_status">Payment Status</Label>
                    <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as PaymentStatus)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_STATUSES.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="order_type">Order Type</Label>
                    <Select value={orderType} onValueChange={(v) => setOrderType(v as OrderType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORDER_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer_type">Customer Type</Label>
                    <Select value={customerType} onValueChange={(v) => setCustomerType(v as CustomerType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CUSTOMER_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shipping_address">Shipping Address</Label>
                  <Textarea
                    id="shipping_address"
                    value={shippingAddress}
                    onChange={e => setShippingAddress(e.target.value)}
                    disabled={loading}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="committed_timeline">Committed Timeline</Label>
                  <Input
                    id="committed_timeline"
                    value={committedTimeline}
                    onChange={e => setCommittedTimeline(e.target.value)}
                    disabled={loading}
                    placeholder="e.g., 2-3 weeks, End of month"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="total_sales_amount">Total Sales Amount (₹)</Label>
                    <Input
                      id="total_sales_amount"
                      type="number"
                      min={0}
                      step={0.01}
                      value={totalSalesAmount}
                      onChange={e => setTotalSalesAmount(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount_paid">Amount Paid (₹)</Label>
                    <Input
                      id="amount_paid"
                      type="number"
                      min={0}
                      step={0.01}
                      value={amountPaid}
                      onChange={e => setAmountPaid(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="payment_terms">Payment Terms</Label>
                    <Input
                      id="payment_terms"
                      value={paymentTerms}
                      onChange={e => setPaymentTerms(e.target.value)}
                      disabled={loading}
                      placeholder="e.g., 50% advance, 50% on delivery"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment_due_date">Payment Due Date</Label>
                    <Input
                      id="payment_due_date"
                      type="date"
                      value={paymentDueDate}
                      onChange={e => setPaymentDueDate(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>

                {canSeeProcurement && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="supplier_name">Supplier Name</Label>
                        <Input
                          id="supplier_name"
                          value={supplierName}
                          onChange={e => setSupplierName(e.target.value)}
                          disabled={loading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="supplier_contact">Supplier Contact</Label>
                        <Input
                          id="supplier_contact"
                          value={supplierContact}
                          onChange={e => setSupplierContact(e.target.value)}
                          disabled={loading}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="procurement_rate">Procurement Rate (₹)</Label>
                        <Input
                          id="procurement_rate"
                          type="number"
                          min={0}
                          step={0.01}
                          value={procurementRate}
                          onChange={e => setProcurementRate(e.target.value)}
                          disabled={loading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="selling_price">Selling Price per Unit (₹)</Label>
                        <Input
                          id="selling_price"
                          type="number"
                          min={0}
                          step={0.01}
                          value={sellingPrice}
                          onChange={e => setSellingPrice(e.target.value)}
                          disabled={loading}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tracking_number">Tracking Number</Label>
                    <Input
                      id="tracking_number"
                      value={trackingNumber}
                      onChange={e => setTrackingNumber(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tracking_url">Tracking URL</Label>
                    <Input
                      id="tracking_url"
                      type="url"
                      value={trackingUrl}
                      onChange={e => setTrackingUrl(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="estimated_delivery">Estimated Delivery</Label>
                    <Input
                      id="estimated_delivery"
                      type="date"
                      value={estimatedDelivery}
                      onChange={e => setEstimatedDelivery(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="actual_delivery">Actual Delivery</Label>
                    <Input
                      id="actual_delivery"
                      type="date"
                      value={actualDelivery}
                      onChange={e => setActualDelivery(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sales_notes">Sales Notes</Label>
                  <Textarea
                    id="sales_notes"
                    value={salesNotes}
                    onChange={e => setSalesNotes(e.target.value)}
                    disabled={loading}
                    rows={2}
                    placeholder="Notes from sales team"
                  />
                </div>

                {canSeeProcurement && (
                  <div className="space-y-2">
                    <Label htmlFor="internal_notes">Internal Notes (Supply Chain Only)</Label>
                    <Textarea
                      id="internal_notes"
                      value={internalNotes}
                      onChange={e => setInternalNotes(e.target.value)}
                      disabled={loading}
                      rows={2}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="customer_notes">Customer Notes (Visible to Sales)</Label>
                  <Textarea
                    id="customer_notes"
                    value={customerNotes}
                    onChange={e => setCustomerNotes(e.target.value)}
                    disabled={loading}
                    rows={2}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between gap-2 pt-4 border-t">
            <div>
              {canDelete && (
                <Button
                  variant="destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                {canEdit ? 'Cancel' : 'Close'}
              </Button>
              {canEdit && (
                <Button onClick={handleUpdate} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this order? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={loading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {loading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PaymentUploadDialog
        orderId={order.id}
        open={paymentUploadOpen}
        onOpenChange={setPaymentUploadOpen}
      />
    </>
  );
}
