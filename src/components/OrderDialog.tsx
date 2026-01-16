import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Order, OrderStatus, ORDER_STATUSES, PaymentStatus, PAYMENT_STATUSES, OrderType, ORDER_TYPES, CustomerType, CUSTOMER_TYPES, RefundStatus, REFUND_STATUSES, ORDER_PRIORITIES, OrderOutcome, ORDER_OUTCOMES, LostReason, LOST_REASONS } from '@/hooks/useOrders';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { PaymentRecordsList } from '@/components/PaymentRecordsList';
import { PaymentUploadDialog } from '@/components/PaymentUploadDialog';
import { useAuth } from '@/hooks/useAuth';
import { useEditHistory } from '@/hooks/useEditHistory';
import { useOrderItems, ORDER_ITEM_STATUSES } from '@/hooks/useOrderItems';
import { useSuppliers } from '@/hooks/useSuppliers';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { calculatePaymentDueDate } from '@/lib/paymentTerms';
import { toast } from 'sonner';
import { Loader2, Package, User, Building2, Truck, Calendar, ExternalLink, Trash2, TrendingUp, Clock, CreditCard, MapPin, Upload, FileText, X, ShoppingCart, RotateCcw, AlertTriangle, Flag, Trophy, XCircle, Undo2, CalendarIcon } from 'lucide-react';
import { OrderNumberBadge } from '@/components/OrderNumberBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OrderSupplierPayments } from '@/components/OrderSupplierPayments';
import { EditHistoryPanel } from '@/components/EditHistoryPanel';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

interface OrderDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (orderId: string, updates: Partial<Order>) => Promise<boolean>;
  onDelete: (orderId: string) => Promise<boolean>;
  onEscalate?: (orderId: string, reason: string) => Promise<boolean>;
}

const paymentStatusConfig: Record<PaymentStatus, { label: string; className: string }> = {
  pending: { label: 'Payment Pending', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  partial: { label: 'Partial Received', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  full: { label: 'Paid in Full', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
};

const outcomeConfig: Record<OrderOutcome, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' },
  won: { label: 'Won', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  lost: { label: 'Lost', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
};

export function OrderDialog({ order, open, onOpenChange, onUpdate, onDelete, onEscalate }: OrderDialogProps) {
  const { role, user, profile } = useAuth();
  const { fetchOrderItems } = useOrderItems();
  const { suppliers } = useSuppliers();
  const { recordChanges } = useEditHistory();
  const isAdmin = role === 'admin';
  const isSales = role === 'sales';
  const canEdit = role === 'supply_chain' || role === 'admin';
  const canEditSalesFields = isSales || canEdit;
  const canDelete = role === 'admin';
  const canSeeProcurement = role === 'supply_chain' || role === 'admin';
  const canEscalate = isSales && onEscalate;

  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentUploadOpen, setPaymentUploadOpen] = useState(false);
  const [invoiceUploading, setInvoiceUploading] = useState(false);
  const [poUploading, setPoUploading] = useState(false);
  const invoiceInputRef = useRef<HTMLInputElement>(null);
  const poInputRef = useRef<HTMLInputElement>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [escalationReason, setEscalationReason] = useState('');
  const [showEscalationForm, setShowEscalationForm] = useState(false);
  const [escalating, setEscalating] = useState(false);

  const [status, setStatus] = useState<OrderStatus>('po_received');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [orderType, setOrderType] = useState<OrderType>('prepaid');
  const [customerType, setCustomerType] = useState<CustomerType>('b2b');
  const [shippingAddress, setShippingAddress] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [procurementRate, setProcurementRate] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [totalSalesAmount, setTotalSalesAmount] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
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
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [poUrl, setPoUrl] = useState<string | null>(null);
  const [isRefundRequested, setIsRefundRequested] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundStatus, setRefundStatus] = useState<RefundStatus>('pending');
  const [priority, setPriority] = useState(3);
  const [orderOutcome, setOrderOutcome] = useState<OrderOutcome>('pending');
  const [lostReason, setLostReason] = useState<LostReason>('price');
  const [lostReasonNotes, setLostReasonNotes] = useState('');
  const [supplierPaymentTerms, setSupplierPaymentTerms] = useState('');
  const [supplierPaymentDueDate, setSupplierPaymentDueDate] = useState('');
  const [isRto, setIsRto] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [orderDate, setOrderDate] = useState<Date | undefined>(undefined);

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
      setDiscountAmount(order.discount_amount?.toString() || '');
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
      setInvoiceUrl(order.invoice_url || null);
      setPoUrl(order.po_url || null);
      setIsRefundRequested(order.is_refund_requested || false);
      setRefundReason(order.refund_reason || '');
      setRefundStatus((order.refund_status as RefundStatus) || 'pending');
      setPriority(order.priority || 3);
      setOrderOutcome((order.order_outcome || 'pending') as OrderOutcome);
      setLostReason((order.lost_reason as LostReason) || 'price');
      setLostReasonNotes(order.lost_reason_notes || '');
      setSupplierPaymentTerms((order as any).supplier_payment_terms || '');
      setSupplierPaymentDueDate((order as any).supplier_payment_due_date || '');
      setIsRto(order.is_rto || false);
      setCancellationReason(order.cancellation_reason || '');
      setOrderDate(order.order_date ? new Date(order.order_date) : new Date(order.created_at));
      setEscalationReason('');
      setShowEscalationForm(false);
      
      // Fetch order items
      fetchOrderItems(order.id).then(setOrderItems);
    }
  }, [order, fetchOrderItems]);

  if (!order) return null;

  // Calculate profit (only visible to admin)
  const profit = order.selling_price && order.procurement_rate 
    ? (order.selling_price - order.procurement_rate) * order.quantity
    : null;

  const balanceAmount = order.total_sales_amount && order.amount_paid !== null
    ? order.total_sales_amount - (order.amount_paid || 0)
    : null;

  const handleInvoiceUpload = async (file: File) => {
    if (!user || !order) return;
    
    setInvoiceUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${order.id}-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('invoices')
        .getPublicUrl(filePath);

      // Update order with invoice URL
      const success = await onUpdate(order.id, { invoice_url: publicUrl });
      if (success) {
        setInvoiceUrl(publicUrl);
        toast.success('Invoice uploaded successfully');
      }
    } catch (error: any) {
      console.error('Error uploading invoice:', error);
      toast.error('Failed to upload invoice');
    } finally {
      setInvoiceUploading(false);
      if (invoiceInputRef.current) {
        invoiceInputRef.current.value = '';
      }
    }
  };

  const handleRemoveInvoice = async () => {
    if (!order) return;
    
    setInvoiceUploading(true);
    try {
      const success = await onUpdate(order.id, { invoice_url: null });
      if (success) {
        setInvoiceUrl(null);
        toast.success('Invoice removed');
      }
    } catch (error: any) {
      console.error('Error removing invoice:', error);
      toast.error('Failed to remove invoice');
    } finally {
      setInvoiceUploading(false);
    }
  };

  const handlePoUpload = async (file: File) => {
    if (!user || !order) return;
    
    setPoUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${order.id}-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('purchase-orders')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('purchase-orders')
        .getPublicUrl(filePath);

      // Append to existing PO URLs or create new
      const existingUrls = order.po_url ? order.po_url.split(',').map(u => u.trim()) : [];
      const newPoUrl = [...existingUrls, publicUrl].join(', ');

      const success = await onUpdate(order.id, { po_url: newPoUrl } as any);
      if (success) {
        setPoUrl(newPoUrl);
        toast.success('PO uploaded successfully');
      }
    } catch (error: any) {
      console.error('Error uploading PO:', error);
      toast.error('Failed to upload PO');
    } finally {
      setPoUploading(false);
      if (poInputRef.current) {
        poInputRef.current.value = '';
      }
    }
  };

  const handleRemovePo = async (urlToRemove: string) => {
    if (!order || !poUrl) return;
    
    setPoUploading(true);
    try {
      // Extract file path from URL for storage deletion
      const pathMatch = urlToRemove.match(/purchase-orders\/(.+)$/);
      if (pathMatch) {
        await supabase.storage.from('purchase-orders').remove([pathMatch[1]]);
      }

      const existingUrls = poUrl.split(',').map(u => u.trim());
      const remainingUrls = existingUrls.filter(u => u !== urlToRemove);
      const newPoUrl = remainingUrls.length > 0 ? remainingUrls.join(', ') : null;

      const success = await onUpdate(order.id, { po_url: newPoUrl } as any);
      if (success) {
        setPoUrl(newPoUrl);
        toast.success('PO removed');
      }
    } catch (error: any) {
      console.error('Error removing PO:', error);
      toast.error('Failed to remove PO');
    } finally {
      setPoUploading(false);
    }
  };

  // Check if user can delete PO (sales own orders or admin)
  const canDeletePo = isAdmin || (isSales && order?.sales_person_id === user?.id);

  const handleUpdate = async () => {
    if (!canEdit && !canEditSalesFields) return;
    
    // Validate cancellation reason when status is cancelled
    if (status === 'cancelled' && !cancellationReason.trim()) {
      toast.error('Cancellation reason is required when marking order as cancelled');
      return;
    }
    
    setLoading(true);

    // Determine if status should auto-change based on tracking details
    let finalStatus = status;
    const trackingWasAdded = trackingNumber && !order.tracking_number;
    const trackingWasUpdated = trackingNumber && order.tracking_number !== trackingNumber;
    
    if ((trackingWasAdded || trackingWasUpdated) && status !== 'in_transit' && status !== 'delivery_done' && status !== 'cancelled') {
      finalStatus = 'in_transit' as OrderStatus;
    }

    const updates: Partial<Order> = {
      status: finalStatus,
      payment_status: paymentStatus,
      order_type: orderType,
      customer_type: customerType,
      shipping_address: shippingAddress || null,
      supplier_name: supplierName || null,
      supplier_contact: supplierContact || null,
      procurement_rate: procurementRate ? parseFloat(procurementRate) : null,
      selling_price: sellingPrice ? parseFloat(sellingPrice) : null,
      total_sales_amount: totalSalesAmount ? parseFloat(totalSalesAmount) : null,
      discount_amount: discountAmount ? parseFloat(discountAmount) : null,
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
      invoice_url: invoiceUrl,
      is_refund_requested: isRefundRequested || finalStatus === 'cancelled',
      refund_reason: isRefundRequested ? (refundReason || null) : (finalStatus === 'cancelled' ? cancellationReason : null),
      refund_status: (isRefundRequested || finalStatus === 'cancelled') ? refundStatus : null,
      refund_requested_at: (isRefundRequested || finalStatus === 'cancelled') && !order.is_refund_requested ? new Date().toISOString() : order.refund_requested_at,
      refund_requested_by: (isRefundRequested || finalStatus === 'cancelled') && !order.is_refund_requested ? user?.id : order.refund_requested_by,
      priority,
      order_outcome: orderOutcome,
      lost_reason: orderOutcome === 'lost' ? lostReason : null,
      lost_reason_notes: orderOutcome === 'lost' ? (lostReasonNotes || null) : null,
      outcome_updated_at: orderOutcome !== order.order_outcome ? new Date().toISOString() : order.outcome_updated_at,
      outcome_updated_by: orderOutcome !== order.order_outcome ? user?.id : order.outcome_updated_by,
      supplier_payment_terms: supplierPaymentTerms || null,
      supplier_payment_due_date: supplierPaymentDueDate || null,
      order_date: orderDate ? format(orderDate, 'yyyy-MM-dd') : null,
      // RTO and cancellation fields
      is_rto: isRto,
      rto_marked_at: isRto && !order.is_rto ? new Date().toISOString() : order.rto_marked_at,
      rto_marked_by: isRto && !order.is_rto ? user?.id : order.rto_marked_by,
      cancellation_reason: finalStatus === 'cancelled' ? cancellationReason : null,
      cancelled_at: finalStatus === 'cancelled' && order.status !== 'cancelled' ? new Date().toISOString() : order.cancelled_at,
      cancelled_by: finalStatus === 'cancelled' && order.status !== 'cancelled' ? user?.id : order.cancelled_by,
    } as Partial<Order>;

    // Track changes for edit history
    const changes: Record<string, { old: any; new: any }> = {};
    
    if (order.status !== finalStatus) changes.status = { old: order.status, new: finalStatus };
    if (order.payment_status !== paymentStatus) changes.payment_status = { old: order.payment_status, new: paymentStatus };
    if (order.supplier_name !== (supplierName || null)) changes.supplier_name = { old: order.supplier_name, new: supplierName || null };
    if (order.procurement_rate !== (procurementRate ? parseFloat(procurementRate) : null)) {
      changes.procurement_rate = { old: order.procurement_rate, new: procurementRate ? parseFloat(procurementRate) : null };
    }
    if (order.selling_price !== (sellingPrice ? parseFloat(sellingPrice) : null)) {
      changes.selling_price = { old: order.selling_price, new: sellingPrice ? parseFloat(sellingPrice) : null };
    }
    if (order.total_sales_amount !== (totalSalesAmount ? parseFloat(totalSalesAmount) : null)) {
      changes.total_sales_amount = { old: order.total_sales_amount, new: totalSalesAmount ? parseFloat(totalSalesAmount) : null };
    }
    if (order.discount_amount !== (discountAmount ? parseFloat(discountAmount) : null)) {
      changes.discount_amount = { old: order.discount_amount, new: discountAmount ? parseFloat(discountAmount) : null };
    }
    if (order.priority !== priority) changes.priority = { old: order.priority, new: priority };
    if (order.order_outcome !== orderOutcome) changes.order_outcome = { old: order.order_outcome, new: orderOutcome };
    if (order.internal_notes !== (internalNotes || null)) changes.internal_notes = { old: order.internal_notes, new: internalNotes || null };
    if (order.sales_notes !== (salesNotes || null)) changes.sales_notes = { old: order.sales_notes, new: salesNotes || null };
    if (order.customer_notes !== (customerNotes || null)) changes.customer_notes = { old: order.customer_notes, new: customerNotes || null };
    if (order.is_rto !== isRto) changes.is_rto = { old: order.is_rto, new: isRto };
    if (order.cancellation_reason !== (cancellationReason || null)) changes.cancellation_reason = { old: order.cancellation_reason, new: cancellationReason || null };

    const success = await onUpdate(order.id, updates);
    
    // Record edit history
    if (success && Object.keys(changes).length > 0) {
      await recordChanges('orders', order.id, changes, profile?.name || 'Unknown');
    }
    
    setLoading(false);
    if (success) {
      onOpenChange(false);
    }
  };

  const handleEscalate = async () => {
    if (!onEscalate || !escalationReason.trim()) return;
    
    setEscalating(true);
    const success = await onEscalate(order.id, escalationReason);
    setEscalating(false);
    if (success) {
      setShowEscalationForm(false);
      setEscalationReason('');
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
                  <OrderNumberBadge orderNumber={order.order_number} size="md" />
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2 mt-1 flex-wrap">
                  {order.product_category}
                  <Badge variant="outline" className="text-xs">
                    {order.customer_type.toUpperCase()}
                  </Badge>
                  <Badge variant="outline" className="text-xs capitalize">
                    {order.order_type}
                  </Badge>
                  {/* Priority Badge */}
                  {(() => {
                    const priorityConfig = ORDER_PRIORITIES.find(p => p.value === order.priority) || ORDER_PRIORITIES[2];
                    return (
                      <Badge className={priorityConfig.color}>
                        <Flag className="h-3 w-3 mr-1" />
                        P{order.priority}
                      </Badge>
                    );
                  })()}
                  {order.is_escalated && (
                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Escalated
                    </Badge>
                  )}
                  {order.order_outcome && order.order_outcome !== 'pending' && (
                    <Badge className={outcomeConfig[order.order_outcome].className}>
                      {order.order_outcome === 'won' ? <Trophy className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                      {outcomeConfig[order.order_outcome].label}
                    </Badge>
                  )}
                  {order.is_rto && (
                    <Badge variant="outline" className="text-xs border-orange-500 text-orange-600 dark:text-orange-400">
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
                </DialogDescription>
              </div>
              <OrderStatusBadge status={order.status} />
            </div>
          </DialogHeader>

          <div className="space-y-6">
            {/* Escalation Banner */}
            {order.is_escalated && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-red-800 dark:text-red-300">Order Escalated - Priority 1</h4>
                    <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                      <strong>Reason:</strong> {order.escalation_reason}
                    </p>
                    {order.escalated_at && (
                      <p className="text-xs text-red-600 dark:text-red-500 mt-1">
                        Escalated on {format(new Date(order.escalated_at), 'dd MMM yyyy, HH:mm')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Sales Escalation Form (only for sales on non-escalated pending orders) */}
            {canEscalate && !order.is_escalated && order.status !== 'delivery_done' && order.status !== 'cancelled' && (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                {showEscalationForm ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      <span className="font-medium text-amber-800 dark:text-amber-300">Escalate Order</span>
                    </div>
                    <Textarea
                      placeholder="Describe why this order needs urgent attention..."
                      value={escalationReason}
                      onChange={(e) => setEscalationReason(e.target.value)}
                      rows={2}
                      className="bg-background"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleEscalate}
                        disabled={escalating || !escalationReason.trim()}
                        className="bg-amber-600 hover:bg-amber-700"
                      >
                        {escalating ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Escalating...
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-4 w-4 mr-2" />
                            Confirm Escalation
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowEscalationForm(false);
                          setEscalationReason('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      This will mark the order as Priority 1 and notify admins and supply chain.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      <span className="text-sm text-amber-800 dark:text-amber-300">
                        Need urgent attention for this order?
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/30"
                      onClick={() => setShowEscalationForm(true)}
                    >
                      Escalate Order
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Quick Status Update */}
            <div className="p-4 bg-muted/30 rounded-lg border">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <CalendarIcon className="h-4 w-4" />
                    Order Date
                  </Label>
                  {canEditSalesFields ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal bg-background",
                            !orderDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {orderDate ? format(orderDate, "dd MMM yyyy") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={orderDate}
                          onSelect={setOrderDate}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <p className="text-sm font-medium bg-background p-2 rounded border">
                      {orderDate ? format(orderDate, 'dd MMM yyyy') : format(new Date(order.created_at), 'dd MMM yyyy')}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Package className="h-4 w-4" />
                    Order Status
                  </Label>
                  {canEditSalesFields ? (
                    <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus)}>
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORDER_STATUSES.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="p-2">
                      <OrderStatusBadge status={order.status} />
                    </div>
                  )}
                </div>
              </div>
              {status === 'cancelled' && canEditSalesFields && (
                <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 space-y-3">
                  <h5 className="font-medium text-red-800 dark:text-red-300 flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    Cancellation Reason (Required)
                  </h5>
                  <Textarea
                    value={cancellationReason}
                    onChange={e => setCancellationReason(e.target.value)}
                    disabled={loading}
                    rows={2}
                    placeholder="Please provide a reason for cancellation..."
                    className="bg-background"
                  />
                </div>
              )}
            </div>

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

            {/* Order Items */}
            {orderItems.length > 0 && (
              <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  <span className="font-medium">Order Items ({orderItems.length})</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      {canSeeProcurement && <TableHead className="text-right">Procurement</TableHead>}
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <span className="font-medium">{item.product_name}</span>
                            {item.product_code && (
                              <span className="text-xs text-muted-foreground ml-2">({item.product_code})</span>
                            )}
                          </div>
                          {item.notes && (
                            <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {ORDER_ITEM_STATUSES.find(s => s.value === item.status)?.label || item.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">
                          {item.unit_price ? `₹${item.unit_price.toLocaleString('en-IN')}` : '-'}
                        </TableCell>
                        {canSeeProcurement && (
                          <TableCell className="text-right">
                            {item.procurement_rate ? `₹${item.procurement_rate.toLocaleString('en-IN')}` : '-'}
                          </TableCell>
                        )}
                        <TableCell className="text-right font-medium">
                          {item.unit_price ? `₹${(item.unit_price * item.quantity).toLocaleString('en-IN')}` : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                {order.discount_amount && order.discount_amount > 0 && (
                  <div>
                    <span className="text-muted-foreground">Discount:</span>
                    <p className="font-medium text-purple-600">-₹{order.discount_amount?.toLocaleString('en-IN')}</p>
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

            {/* Profit Display - visible to supply chain and admin */}
            {canSeeProcurement && order.selling_price && order.procurement_rate && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-green-800 dark:text-green-300">Profit Analysis</span>
                </div>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Procurement (per unit):</span>
                    <p className="font-medium">₹{order.procurement_rate?.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Selling (per unit):</span>
                    <p className="font-medium">₹{order.selling_price?.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Cost (×{order.quantity}):</span>
                    <p className="font-medium">₹{(order.procurement_rate * order.quantity).toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Revenue (×{order.quantity}):</span>
                    <p className="font-medium">₹{(order.selling_price * order.quantity).toLocaleString('en-IN')}</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-700">
                  <span className="text-muted-foreground">Total Profit:</span>
                  <p className={`font-bold text-lg ${profit && profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    ₹{profit?.toLocaleString('en-IN')}
                    <span className="text-xs font-normal text-muted-foreground ml-2">
                      (₹{(order.selling_price - order.procurement_rate).toLocaleString('en-IN')} × {order.quantity})
                    </span>
                  </p>
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

            {/* Invoice Section */}
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Invoice
                </h4>
              </div>
              
              {invoiceUrl ? (
                <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                  <a
                    href={invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-2 text-sm"
                  >
                    <FileText className="h-4 w-4" />
                    View Invoice
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={handleRemoveInvoice}
                      disabled={invoiceUploading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ) : canEdit ? (
                <div>
                  <input
                    ref={invoiceInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleInvoiceUpload(file);
                    }}
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => invoiceInputRef.current?.click()}
                    disabled={invoiceUploading}
                  >
                    {invoiceUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Invoice
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Supports PDF, PNG, JPG (max 10MB)
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No invoice attached</p>
              )}
            </div>

            {/* Purchase Order Section */}
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Purchase Order (PO)
                </h4>
              </div>
              
              {poUrl ? (
                <div className="space-y-2">
                  {poUrl.split(',').map((url, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                      <a
                        href={url.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-2 text-sm truncate flex-1"
                      >
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="truncate">PO Document {idx + 1}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                      {canDeletePo && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                          onClick={() => handleRemovePo(url.trim())}
                          disabled={poUploading}
                        >
                          {poUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  ))}
                  {/* Add more PO button */}
                  {canDeletePo && (
                    <div>
                      <input
                        ref={poInputRef}
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePoUpload(file);
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => poInputRef.current?.click()}
                        disabled={poUploading}
                      >
                        {poUploading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Add More PO
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              ) : canDeletePo ? (
                <div>
                  <input
                    ref={poInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePoUpload(file);
                    }}
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => poInputRef.current?.click()}
                    disabled={poUploading}
                  >
                    {poUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload PO
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Supports PDF, PNG, JPG (max 10MB)
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No PO attached</p>
              )}
            </div>

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

                {/* Priority Selection */}
                <div className="space-y-2">
                  <Label htmlFor="priority" className="flex items-center gap-2">
                    <Flag className="h-4 w-4" />
                    Priority
                  </Label>
                  <Select value={priority.toString()} onValueChange={(v) => setPriority(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_PRIORITIES.map(p => (
                        <SelectItem key={p.value} value={p.value.toString()}>{p.label}</SelectItem>
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

                {/* RTO Marking - for procured orders */}
                {(order.status === 'procurement_done' || order.status === 'delivery_done') && (
                  <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800 space-y-3">
                    <h5 className="font-medium text-orange-800 dark:text-orange-300 flex items-center gap-2">
                      <Undo2 className="h-4 w-4" />
                      Return to Origin (RTO)
                    </h5>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="is_rto"
                        checked={isRto}
                        onChange={(e) => setIsRto(e.target.checked)}
                        disabled={loading}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="is_rto" className="cursor-pointer">
                        Mark this order as RTO (Return to Origin)
                      </Label>
                    </div>
                    {isRto && (
                      <p className="text-xs text-orange-600 dark:text-orange-400">
                        Order marked as RTO. The item has been returned to origin.
                      </p>
                    )}
                  </div>
                )}

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
                    <Label htmlFor="discount_amount">Discount (₹)</Label>
                    <Input
                      id="discount_amount"
                      type="number"
                      min={0}
                      step={0.01}
                      value={discountAmount}
                      onChange={e => setDiscountAmount(e.target.value)}
                      disabled={loading}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
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

                {/* Refund Section */}
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Refund Request
                  </h4>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="is_refund_requested"
                      checked={isRefundRequested}
                      onChange={(e) => setIsRefundRequested(e.target.checked)}
                      disabled={loading}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="is_refund_requested" className="cursor-pointer">
                      Mark as Refund Request
                    </Label>
                  </div>

                  {isRefundRequested && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="refund_reason">Refund Reason</Label>
                        <Textarea
                          id="refund_reason"
                          value={refundReason}
                          onChange={e => setRefundReason(e.target.value)}
                          disabled={loading}
                          rows={2}
                          placeholder="Describe the reason for refund..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="refund_status">Refund Status</Label>
                        <Select value={refundStatus} onValueChange={(v) => setRefundStatus(v as RefundStatus)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {REFUND_STATUSES.map(s => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Edit History */}
          <EditHistoryPanel tableName="orders" recordId={order.id} />

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
                {(canEdit || canEditSalesFields) ? 'Cancel' : 'Close'}
              </Button>
              {(canEdit || canEditSalesFields) && (
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
