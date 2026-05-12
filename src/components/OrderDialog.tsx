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
import { isValidHttpUrl } from '@/lib/urlValidation';
import { COURIER_NAMES, buildTrackingUrl } from '@/lib/courierTracking';
import { CourierCombobox } from '@/components/CourierCombobox';
import { Loader2, Package, User, Building2, Truck, Calendar, ExternalLink, Trash2, TrendingUp, Clock, CreditCard, MapPin, Upload, FileText, X, ShoppingCart, RotateCcw, AlertTriangle, Flag, Trophy, XCircle, Undo2, CalendarIcon, Pencil, Check } from 'lucide-react';
import { OrderNumberBadge } from '@/components/OrderNumberBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OrderSupplierPayments } from '@/components/OrderSupplierPayments';
import { EditHistoryPanel } from '@/components/EditHistoryPanel';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { ProductSelect } from '@/components/ProductSelect';
import { PricelistItem } from '@/hooks/usePricelist';
import { InventoryFulfillmentPanel } from '@/components/order/InventoryFulfillmentPanel';
import { DocumentViewer } from '@/components/hr/DocumentViewer';

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
  const isSupplyChain = role === 'supply_chain';
  const isFinance = role === 'finance';
  // Sales and Supply Chain now have full field editing access
  const canEdit = isSupplyChain || isAdmin || isFinance || isSales;
  const isOwnOrder = isSales && order?.sales_person_id === user?.id;
  const canEditSalesFields = canEdit;
  // Combined edit permission - all roles with canEdit can edit all fields
  const canEditOrder = canEdit;
  const canDelete = isAdmin;
  const canSeeProcurement = isSupplyChain || isAdmin || isFinance;
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
  
  // Inline edit states
  const [editingCustomerInfo, setEditingCustomerInfo] = useState(false);
  const [editingShipping, setEditingShipping] = useState(false);
  const [editingPayment, setEditingPayment] = useState(false);
  const [editingTracking, setEditingTracking] = useState(false);
  const [editingOrderItems, setEditingOrderItems] = useState(false);
  const [editedOrderItems, setEditedOrderItems] = useState<Record<string, any>>({});
  const [productNameReasonOpen, setProductNameReasonOpen] = useState(false);
  const [productNameReason, setProductNameReason] = useState('');

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
  const [courierName, setCourierName] = useState('');
  const [committedTimeline, setCommittedTimeline] = useState('');
  const [estimatedDelivery, setEstimatedDelivery] = useState('');
  const [actualDelivery, setActualDelivery] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [salesNotes, setSalesNotes] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [poUrl, setPoUrl] = useState<string | null>(null);
  const [invoiceViewer, setInvoiceViewer] = useState<{ open: boolean; url: string | null; name: string; fileType: string }>({
    open: false,
    url: null,
    name: 'Invoice',
    fileType: '',
  });
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [editingInvoiceNumber, setEditingInvoiceNumber] = useState(false);
  const [poNumber, setPoNumber] = useState<string>('');
  const [editingPoNumber, setEditingPoNumber] = useState(false);
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
  const [customerName, setCustomerName] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [customerGst, setCustomerGst] = useState('');

  // Auto-generate tracking URL whenever courier name + tracking number change.
  // Overwrite previous URL if it was auto-generated for any known courier; keep
  // only fully-custom URLs that don't belong to any known carrier domain.
  useEffect(() => {
    if (!courierName) return;
    const generated = buildTrackingUrl(courierName, trackingNumber);
    if (!generated) return;
    setTrackingUrl((prev) => {
      if (prev) {
        const knownHosts = COURIER_NAMES
          .map((cn) => {
            const u = buildTrackingUrl(cn, '1');
            try { return u ? new URL(u).hostname : ''; } catch { return ''; }
          })
          .filter(Boolean);
        const prevIsKnown = knownHosts.some((h) => prev.includes(h));
        if (!prevIsKnown) return prev;
      }
      return generated;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courierName, trackingNumber]);

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
      setCourierName((order as any).courier_name || '');
      setCommittedTimeline(order.committed_timeline || '');
      setEstimatedDelivery(order.estimated_delivery || '');
      setActualDelivery(order.actual_delivery || '');
      setInternalNotes(order.internal_notes || '');
      setCustomerNotes(order.customer_notes || '');
      setSalesNotes(order.sales_notes || '');
      setPaymentDueDate(order.payment_due_date || '');
      setInvoiceUrl(order.invoice_url || null);
      setPoUrl(order.po_url || null);
      setPoNumber(order.po_number || '');
      setInvoiceNumber(order.invoice_number || '');
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
      setCustomerName(order.customer_name || '');
      setCustomerCompany(order.customer_company || '');
      setCustomerGst((order as any).customer_gst || '');
      setEscalationReason('');
      setShowEscalationForm(false);

      // Reset all inline edit flags when switching orders or reopening dialog
      setEditingCustomerInfo(false);
      setEditingShipping(false);
      setEditingPayment(false);
      setEditingTracking(false);
      setEditingOrderItems(false);
      setEditedOrderItems({});
      setEditingInvoiceNumber(false);
      setEditingPoNumber(false);

      // Fetch order items
      fetchOrderItems(order.id).then(setOrderItems);
    }
  }, [order?.id, fetchOrderItems]);

  if (!order) return null;

  // Calculate profit (only visible to admin)
  const profit = order.selling_price && order.procurement_rate 
    ? (order.selling_price - order.procurement_rate) * order.quantity
    : null;

  const balanceAmount = order.total_sales_amount != null
    ? (order.total_sales_amount || 0) - (order.amount_paid || 0)
    : null;

  const handleInvoiceUpload = async (file: File) => {
    if (!user || !order) return;
    
    setInvoiceUploading(true);
    try {
      const { validateFile } = await import('@/lib/fileValidation');
      const validation = validateFile(file, 'invoices');
      if (!validation.valid) { toast.error(validation.error); setInvoiceUploading(false); return; }
      const fileExt = file.name.split('.').pop();
      const fileName = `${order.id}-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Store the storage path (not a public URL) so we can create signed URLs later
      const storagePath = filePath;

      // Update order with invoice URL
      const success = await onUpdate(order.id, { invoice_url: storagePath });
      if (success) {
        setInvoiceUrl(storagePath);
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
      const { validateFile } = await import('@/lib/fileValidation');
      const validation = validateFile(file, 'documents');
      if (!validation.valid) { toast.error(validation.error); setPoUploading(false); return; }
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
    if (!canEditOrder && !canEditSalesFields) return;
    
    // Validate cancellation reason when status is cancelled
    if (status === 'cancelled' && !cancellationReason.trim()) {
      toast.error('Cancellation reason is required when marking order as cancelled');
      return;
    }

    // Validate tracking URL is a proper http(s) link
    if (trackingUrl && !isValidHttpUrl(trackingUrl)) {
      toast.error('Tracking URL must be a valid link starting with http:// or https://');
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
      customer_name: customerName || null,
      customer_company: customerCompany || null,
      customer_gst: customerGst || null,
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
      courier_name: courierName || null,
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

    // Track changes for edit history — compare every editable field
    const changes: Record<string, { old: any; new: any }> = {};
    const trackField = (field: string, oldVal: any, newVal: any) => {
      const norm = (v: any) => (v === '' || v === undefined ? null : v);
      if (norm(oldVal) !== norm(newVal)) changes[field] = { old: oldVal, new: newVal };
    };

    trackField('status', order.status, finalStatus);
    trackField('payment_status', order.payment_status, paymentStatus);
    trackField('order_type', order.order_type, orderType);
    trackField('customer_type', order.customer_type, customerType);
    trackField('customer_name', order.customer_name, customerName || null);
    trackField('customer_company', order.customer_company, customerCompany || null);
    trackField('customer_gst', (order as any).customer_gst, customerGst || null);
    trackField('shipping_address', order.shipping_address, shippingAddress || null);
    trackField('supplier_name', order.supplier_name, supplierName || null);
    trackField('supplier_contact', order.supplier_contact, supplierContact || null);
    trackField('procurement_rate', order.procurement_rate, procurementRate ? parseFloat(procurementRate) : null);
    trackField('selling_price', order.selling_price, sellingPrice ? parseFloat(sellingPrice) : null);
    trackField('total_sales_amount', order.total_sales_amount, totalSalesAmount ? parseFloat(totalSalesAmount) : null);
    trackField('discount_amount', order.discount_amount, discountAmount ? parseFloat(discountAmount) : null);
    trackField('amount_paid', order.amount_paid, amountPaid ? parseFloat(amountPaid) : null);
    trackField('payment_terms', order.payment_terms, paymentTerms || null);
    trackField('payment_due_date', order.payment_due_date, paymentDueDate || null);
    trackField('tracking_number', order.tracking_number, trackingNumber || null);
    trackField('tracking_url', order.tracking_url, trackingUrl || null);
    trackField('courier_name', (order as any).courier_name, courierName || null);
    trackField('committed_timeline', order.committed_timeline, committedTimeline || null);
    trackField('estimated_delivery', order.estimated_delivery, estimatedDelivery || null);
    trackField('actual_delivery', order.actual_delivery, actualDelivery || null);
    trackField('internal_notes', order.internal_notes, internalNotes || null);
    trackField('customer_notes', order.customer_notes, customerNotes || null);
    trackField('sales_notes', order.sales_notes, salesNotes || null);
    trackField('priority', order.priority, priority);
    trackField('order_outcome', order.order_outcome, orderOutcome);
    trackField('lost_reason', order.lost_reason, orderOutcome === 'lost' ? lostReason : null);
    trackField('lost_reason_notes', order.lost_reason_notes, orderOutcome === 'lost' ? (lostReasonNotes || null) : null);
    trackField('is_rto', order.is_rto, isRto);
    trackField('cancellation_reason', order.cancellation_reason, finalStatus === 'cancelled' ? cancellationReason : null);
    trackField('supplier_payment_terms', (order as any).supplier_payment_terms, supplierPaymentTerms || null);
    trackField('supplier_payment_due_date', (order as any).supplier_payment_due_date, supplierPaymentDueDate || null);
    trackField('order_date', order.order_date, orderDate ? format(orderDate, 'yyyy-MM-dd') : null);
    trackField('is_refund_requested', order.is_refund_requested, isRefundRequested || finalStatus === 'cancelled');
    trackField('refund_reason', order.refund_reason, isRefundRequested ? (refundReason || null) : (finalStatus === 'cancelled' ? cancellationReason : null));
    trackField('refund_status', order.refund_status, (isRefundRequested || finalStatus === 'cancelled') ? refundStatus : null);

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
    if (!deleteReason.trim()) {
      setLoading(false);
      toast.error('Please provide a reason for deleting this order');
      return;
    }
    // Persist delete reason then call onDelete (which performs soft-delete)
    await supabase.from('orders').update({ delete_reason: deleteReason.trim() } as any).eq('id', order.id);
    if (user && profile) {
      await recordChanges('orders', order.id, {
        deleted: { old: null, new: 'soft-deleted' },
        delete_reason: { old: null, new: deleteReason.trim() },
      }, profile.name || 'Unknown');
    }
    const success = await onDelete(order.id);
    setLoading(false);
    if (success) {
      setDeleteDialogOpen(false);
      setDeleteReason('');
      onOpenChange(false);
    }
  };

  const commitOrderItemEdits = async (productNameChangeReason: string | null) => {
    setLoading(true);
    try {
      let nameChangedToHeader: string | null = null;
      for (const [itemId, edits] of Object.entries(editedOrderItems)) {
        const originalItem = orderItems.find(i => i.id === itemId);
        if (originalItem) {
          const updates: any = {};
          if (edits.product_name !== originalItem.product_name) updates.product_name = edits.product_name;
          if (edits.quantity !== originalItem.quantity) {
            const nextQty = Number.parseInt(String(edits.quantity), 10);
            updates.quantity = Number.isFinite(nextQty) && nextQty > 0 ? nextQty : 1;
          }
          if (edits.unit_price !== (originalItem.unit_price || '')) {
            const raw = String(edits.unit_price ?? '').trim();
            if (raw === '') {
              updates.unit_price = null;
            } else {
              const next = Number(raw);
              updates.unit_price = Number.isFinite(next) ? next : null;
            }
          }
          if (edits.status !== originalItem.status) updates.status = edits.status;
          if (edits.notes !== (originalItem.notes || '')) updates.notes = edits.notes || null;
          if (canSeeProcurement && edits.procurement_rate !== (originalItem.procurement_rate || '')) {
            const raw = String(edits.procurement_rate ?? '').trim();
            if (raw === '') {
              updates.procurement_rate = null;
            } else {
              const next = Number(raw);
              updates.procurement_rate = Number.isFinite(next) ? next : null;
            }
          }
          if (edits.supplier_id !== (originalItem.supplier_id || '')) {
            updates.supplier_id = edits.supplier_id || null;
          }

          if (Object.keys(updates).length > 0) {
            const { data, error } = await supabase
              .from('order_items')
              .update(updates)
              .eq('id', itemId)
              .select('id')
              .maybeSingle();

            if (error) throw error;
            if (!data) {
              throw new Error('No rows updated (insufficient permission or item not found)');
            }

            // Track if first item's product name changed - mirror to order header
            if (updates.product_name && order && originalItem.product_name === order.product_name) {
              nameChangedToHeader = updates.product_name;
            }

            // Record changes to edit history under the ORDER id for unified view
            if (user && profile && order) {
              const changesRecord: Record<string, { old: any; new: any }> = {};
              Object.entries(updates).forEach(([field, newValue]) => {
                const label = `order_item.${field}`;
                changesRecord[label] = {
                  old: originalItem[field],
                  new: newValue,
                };
              });
              if (updates.product_name && productNameChangeReason) {
                changesRecord['order_item.product_name_change_reason'] = {
                  old: null,
                  new: productNameChangeReason,
                };
              }
              if (Object.keys(changesRecord).length > 0) {
                await recordChanges('orders', order.id, changesRecord, profile.name || 'Unknown');
              }
            }
          }
        }
      }

      // Mirror product_name change to the order header so it shows everywhere
      if (nameChangedToHeader && order) {
        await supabase.from('orders').update({ product_name: nameChangedToHeader }).eq('id', order.id);
        await onUpdate(order.id, { product_name: nameChangedToHeader } as Partial<Order>);
      }

      toast.success('Order items updated');
      if (order) {
        const refreshedItems = await fetchOrderItems(order.id);
        setOrderItems(refreshedItems);
      }
    } catch (error: any) {
      console.error('Error updating order items:', error);
      const msg = String(error?.message || 'Failed to update order items');
      if (msg.toLowerCase().includes('row level security') || msg.toLowerCase().includes('insufficient permission')) {
        toast.error("You don't have permission to update order items for this order");
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
      setEditingOrderItems(false);
      setEditedOrderItems({});
      setProductNameReasonOpen(false);
      setProductNameReason('');
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
              <div className="mr-8 shrink-0">
                <OrderStatusBadge status={order.status} />
              </div>
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

            {/* Order Details - Customer Info */}
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  <span className="font-medium">Customer Information</span>
                </div>
                {canEditOrder && !editingCustomerInfo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingCustomerInfo(true)}
                    className="h-8 gap-1"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                )}
                {editingCustomerInfo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingCustomerInfo(false)}
                    className="h-8 gap-1 text-green-600 hover:text-green-700"
                  >
                    <Check className="h-4 w-4" />
                    Done
                  </Button>
                )}
              </div>
              
              {editingCustomerInfo && canEditOrder ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="inline_customer_name">Customer Name</Label>
                    <Input
                      id="inline_customer_name"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      disabled={loading}
                      placeholder="Customer name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inline_customer_company">Company Name</Label>
                    <Input
                      id="inline_customer_company"
                      value={customerCompany}
                      onChange={e => setCustomerCompany(e.target.value)}
                      disabled={loading}
                      placeholder="Company name"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="inline_customer_gst">GST Number <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                    <Input
                      id="inline_customer_gst"
                      value={customerGst}
                      onChange={e => setCustomerGst(e.target.value.toUpperCase())}
                      disabled={loading}
                      placeholder="e.g., 29ABCDE1234F1Z5"
                      maxLength={15}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="inline_committed_timeline">Committed Timeline</Label>
                    <Input
                      id="inline_committed_timeline"
                      value={committedTimeline}
                      onChange={e => setCommittedTimeline(e.target.value)}
                      disabled={loading}
                      placeholder="e.g., 2-3 weeks"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Quantity:</span>
                    <span className="font-medium">{order.quantity}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-medium">{customerName || order.customer_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Company:</span>
                    <span className="font-medium">{customerCompany || order.customer_company}</span>
                  </div>
                  <div className="flex items-center gap-2 col-span-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">GST Number:</span>
                    {(customerGst || (order as any).customer_gst) ? (
                      <span className="font-medium font-mono">{customerGst || (order as any).customer_gst}</span>
                    ) : (
                      <span className="italic text-muted-foreground">Not provided — click edit to add</span>
                    )}
                  </div>
                  {canSeeProcurement && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Sales:</span>
                      <span className="font-medium">{order.sales_person_name}</span>
                    </div>
                  )}
                  {(committedTimeline || order.committed_timeline) && (
                    <div className="flex items-center gap-2 col-span-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Committed Timeline:</span>
                      <span className="font-medium">{committedTimeline || order.committed_timeline}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Shipping Address */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Shipping Address:</span>
                </div>
                {canEditOrder && !editingShipping && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingShipping(true)}
                    className="h-7 gap-1 text-xs"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                )}
                {editingShipping && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingShipping(false)}
                    className="h-7 gap-1 text-xs text-green-600 hover:text-green-700"
                  >
                    <Check className="h-3 w-3" />
                    Done
                  </Button>
                )}
              </div>
              {editingShipping && canEditOrder ? (
                <Textarea
                  value={shippingAddress}
                  onChange={e => setShippingAddress(e.target.value)}
                  disabled={loading}
                  rows={2}
                  placeholder="Enter shipping address..."
                />
              ) : (
                <p className="font-medium text-sm">{shippingAddress || order.shipping_address || 'No address provided'}</p>
              )}
            </div>

            {/* Order Items */}
            {orderItems.length > 0 && (
              <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5" />
                    <span className="font-medium">Order Items ({orderItems.length})</span>
                  </div>
                  {canEditOrder && !editingOrderItems && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingOrderItems(true);
                        // Initialize edited items with current values
                        const initialEdits: Record<string, any> = {};
                        orderItems.forEach(item => {
                          initialEdits[item.id] = {
                            product_name: item.product_name,
                            quantity: item.quantity,
                            unit_price: item.unit_price || '',
                            status: item.status,
                            notes: item.notes || '',
                            procurement_rate: item.procurement_rate || '',
                            supplier_id: item.supplier_id || '',
                          };
                        });
                        setEditedOrderItems(initialEdits);
                      }}
                      className="h-8 gap-1"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                  )}
                  {editingOrderItems && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // If any product_name changed, require a reason first
                          const hasNameChange = Object.entries(editedOrderItems).some(([itemId, edits]) => {
                            const orig = orderItems.find(i => i.id === itemId);
                            return orig && edits.product_name !== orig.product_name;
                          });
                          if (hasNameChange) {
                            setProductNameReason('');
                            setProductNameReasonOpen(true);
                          } else {
                            void commitOrderItemEdits(null);
                          }
                        }}
                        className="h-8 gap-1 text-green-600 hover:text-green-700"
                        disabled={loading}
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingOrderItems(false);
                          setEditedOrderItems({});
                        }}
                        className="h-8 gap-1"
                      >
                        <X className="h-4 w-4" />
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Supplier</TableHead>
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
                          {editingOrderItems ? (
                            <div className="space-y-1">
                              <ProductSelect
                                value={editedOrderItems[item.id]?.product_name || ''}
                                onChange={(name, product?: PricelistItem) => {
                                  setEditedOrderItems(prev => ({
                                    ...prev,
                                    [item.id]: {
                                      ...prev[item.id],
                                      product_name: name,
                                      ...(product ? {
                                        unit_price: product.dealer_price || product.website_price || prev[item.id]?.unit_price,
                                        product_category: product.product_category,
                                      } : {}),
                                    }
                                  }));
                                }}
                                placeholder="Select or type product..."
                                className="h-8 text-sm"
                              />
                              <Input
                                value={editedOrderItems[item.id]?.notes || ''}
                                onChange={(e) => setEditedOrderItems(prev => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], notes: e.target.value }
                                }))}
                                className="h-7 text-xs"
                                placeholder="Notes (optional)"
                              />
                            </div>
                          ) : (
                            <div>
                              <span className="font-medium">{item.product_name}</span>
                              {item.product_code && (
                                <span className="text-xs text-muted-foreground ml-2">({item.product_code})</span>
                              )}
                              {item.notes && (
                                <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {editingOrderItems ? (
                            <Select
                              value={editedOrderItems[item.id]?.status || item.status}
                              onValueChange={(v) => setEditedOrderItems(prev => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], status: v }
                              }))}
                            >
                              <SelectTrigger className="h-8 w-[130px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ORDER_ITEM_STATUSES.map(s => (
                                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              {ORDER_ITEM_STATUSES.find(s => s.value === item.status)?.label || item.status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {editingOrderItems ? (
                            <Select
                              value={editedOrderItems[item.id]?.supplier_id || 'none'}
                              onValueChange={(v) => setEditedOrderItems(prev => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], supplier_id: v === 'none' ? '' : v }
                              }))}
                            >
                              <SelectTrigger className="h-8 w-[160px] text-sm">
                                <SelectValue placeholder="Select supplier" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No Supplier</SelectItem>
                                {suppliers.map(s => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.name} {s.brand_name ? `(${s.brand_name})` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            (() => {
                              const sup = suppliers.find(s => s.id === item.supplier_id);
                              return sup ? (
                                <span className="text-sm">{sup.name}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              );
                            })()
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editingOrderItems ? (
                            <Input
                              type="number"
                              min={1}
                              value={editedOrderItems[item.id]?.quantity || ''}
                              onChange={(e) => setEditedOrderItems(prev => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], quantity: e.target.value }
                              }))}
                              className="h-8 w-20 text-right text-sm"
                            />
                          ) : (
                            item.quantity
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editingOrderItems ? (
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={editedOrderItems[item.id]?.unit_price || ''}
                              onChange={(e) => setEditedOrderItems(prev => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], unit_price: e.target.value }
                              }))}
                              className="h-8 w-24 text-right text-sm"
                              placeholder="₹0"
                            />
                          ) : (
                            item.unit_price ? `₹${item.unit_price.toLocaleString('en-IN')}` : '-'
                          )}
                        </TableCell>
                        {canSeeProcurement && (
                          <TableCell className="text-right">
                            {editingOrderItems ? (
                              <Input
                                type="number"
                                min={0}
                                step={0.01}
                                value={editedOrderItems[item.id]?.procurement_rate || ''}
                                onChange={(e) => setEditedOrderItems(prev => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], procurement_rate: e.target.value }
                                }))}
                                className="h-8 w-24 text-right text-sm"
                                placeholder="₹0"
                              />
                            ) : (
                              item.procurement_rate ? `₹${item.procurement_rate.toLocaleString('en-IN')}` : '-'
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-right font-medium">
                          {editingOrderItems ? (
                            <span className="text-sm">
                              {editedOrderItems[item.id]?.unit_price && editedOrderItems[item.id]?.quantity
                                ? `₹${(parseFloat(editedOrderItems[item.id].unit_price) * parseInt(editedOrderItems[item.id].quantity)).toLocaleString('en-IN')}`
                                : '-'}
                            </span>
                          ) : (
                            item.unit_price ? `₹${(item.unit_price * item.quantity).toLocaleString('en-IN')}` : '-'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Payment Info */}
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  <span className="font-medium">Payment Information</span>
                  <Badge className={paymentConfig.className}>
                    {paymentConfig.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {canEditOrder && !editingPayment && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingPayment(true)}
                      className="h-8 gap-1"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                  )}
                  {editingPayment && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingPayment(false)}
                      className="h-8 gap-1 text-green-600 hover:text-green-700"
                    >
                      <Check className="h-4 w-4" />
                      Done
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPaymentUploadOpen(true)}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Payment
                  </Button>
                </div>
              </div>
              
              {editingPayment && canEditOrder ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="inline_total_sales">Total Sales Amount (₹)</Label>
                    <Input
                      id="inline_total_sales"
                      type="number"
                      min={0}
                      step={0.01}
                      value={totalSalesAmount}
                      onChange={e => setTotalSalesAmount(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inline_discount">Discount (₹)</Label>
                    <Input
                      id="inline_discount"
                      type="number"
                      min={0}
                      step={0.01}
                      value={discountAmount}
                      onChange={e => setDiscountAmount(e.target.value)}
                      disabled={loading}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inline_amount_paid">Amount Paid (₹)</Label>
                    <Input
                      id="inline_amount_paid"
                      type="number"
                      min={0}
                      step={0.01}
                      value={amountPaid}
                      onChange={e => setAmountPaid(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inline_payment_status">Payment Status</Label>
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
                  <div className="space-y-2">
                    <Label htmlFor="inline_payment_terms">Payment Terms</Label>
                    <Input
                      id="inline_payment_terms"
                      value={paymentTerms}
                      onChange={e => setPaymentTerms(e.target.value)}
                      disabled={loading}
                      placeholder="e.g., 50% advance, 50% on delivery"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inline_payment_due">Payment Due Date</Label>
                    <Input
                      id="inline_payment_due"
                      type="date"
                      value={paymentDueDate}
                      onChange={e => setPaymentDueDate(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {(() => {
                    const currentTotal = parseFloat(totalSalesAmount) || order.total_sales_amount || 0;
                    const currentDiscount = parseFloat(discountAmount) || order.discount_amount || 0;
                    const hasDiscount = currentDiscount > 0;
                    const subtotal = currentTotal + currentDiscount;
                    return (
                      <>
                        {hasDiscount && (
                          <div>
                            <span className="text-muted-foreground">Subtotal:</span>
                            <p className="font-medium">₹{subtotal.toLocaleString('en-IN')}</p>
                          </div>
                        )}
                        {hasDiscount && (
                          <div>
                            <span className="text-muted-foreground">Discount:</span>
                            <p className="font-medium text-purple-600">-₹{currentDiscount.toLocaleString('en-IN')}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-muted-foreground">{hasDiscount ? 'Net Amount:' : 'Total Amount:'}</span>
                          <p className="font-medium">₹{currentTotal.toLocaleString('en-IN')}</p>
                        </div>
                      </>
                    );
                  })()}
                  <div>
                    <span className="text-muted-foreground">Paid:</span>
                    <p className="font-medium text-green-600">₹{(parseFloat(amountPaid) || order.amount_paid || 0).toLocaleString('en-IN')}</p>
                  </div>
                  {balanceAmount !== null && balanceAmount > 0 && (
                    <div>
                      <span className="text-muted-foreground">Balance:</span>
                      <p className="font-medium text-orange-600">₹{balanceAmount?.toLocaleString('en-IN')}</p>
                    </div>
                  )}
                  {(paymentTerms || order.payment_terms) && (
                    <div className="col-span-2 md:col-span-4">
                      <span className="text-muted-foreground">Terms:</span>
                      <p className="font-medium">{paymentTerms || order.payment_terms}</p>
                    </div>
                  )}
                </div>
              )}

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
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Tracking Information
                </h4>
                {canEditOrder && !editingTracking && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingTracking(true)}
                    className="h-8 gap-1"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                )}
                {editingTracking && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingTracking(false)}
                    className="h-8 gap-1 text-green-600 hover:text-green-700"
                  >
                    <Check className="h-4 w-4" />
                    Done
                  </Button>
                )}
              </div>
              
              {editingTracking && canEditOrder ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="inline_tracking_number">Tracking Number</Label>
                    <Input
                      id="inline_tracking_number"
                      value={trackingNumber}
                      onChange={e => setTrackingNumber(e.target.value)}
                      disabled={loading}
                      placeholder="Enter tracking number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inline_tracking_url">Tracking URL</Label>
                    <Input
                      id="inline_tracking_url"
                      type="url"
                      value={trackingUrl}
                      onChange={e => setTrackingUrl(e.target.value)}
                      disabled={loading}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inline_courier_name">Courier Name</Label>
                    <CourierCombobox
                      id="inline_courier_name"
                      value={courierName}
                      onChange={setCourierName}
                      disabled={loading}
                      placeholder="Select courier…"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inline_estimated_delivery">Estimated Delivery</Label>
                    <Input
                      id="inline_estimated_delivery"
                      type="date"
                      value={estimatedDelivery}
                      onChange={e => setEstimatedDelivery(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inline_actual_delivery">Actual Delivery</Label>
                    <Input
                      id="inline_actual_delivery"
                      type="date"
                      value={actualDelivery}
                      onChange={e => setActualDelivery(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {(trackingNumber || order.tracking_number) && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Tracking Number:</span>
                      {(trackingUrl || order.tracking_url) ? (
                        <a
                          href={trackingUrl || order.tracking_url || ''}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          {trackingNumber || order.tracking_number}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span>{trackingNumber || order.tracking_number}</span>
                      )}
                    </div>
                  )}
                  {(estimatedDelivery || order.estimated_delivery) && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Est. Delivery:</span>
                      <span>{format(new Date(estimatedDelivery || order.estimated_delivery!), 'dd MMM yyyy')}</span>
                    </div>
                  )}
                  {(actualDelivery || order.actual_delivery) && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Delivered:</span>
                      <span>{format(new Date(actualDelivery || order.actual_delivery!), 'dd MMM yyyy')}</span>
                    </div>
                  )}
                  {!trackingNumber && !order.tracking_number && !estimatedDelivery && !order.estimated_delivery && (
                    <p className="text-sm text-muted-foreground">No tracking information yet</p>
                  )}
                </div>
              )}
            </div>

            {/* Invoice Section */}
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Invoice
                </h4>
              </div>

              {/* Invoice Number - editable */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Invoice No:</span>
                {editingInvoiceNumber ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="Enter invoice number"
                      className="h-7 text-sm"
                    />
                    <Button
                      size="sm"
                      className="h-7 px-2"
                      onClick={async () => {
                        if (order) {
                          await onUpdate(order.id, { invoice_number: invoiceNumber || null } as any);
                        }
                        setEditingInvoiceNumber(false);
                      }}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingInvoiceNumber(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="font-mono font-medium">{invoiceNumber || '—'}</span>
                    {canEditOrder && (
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => setEditingInvoiceNumber(true)}>
                        Edit
                      </Button>
                    )}
                  </>
                )}
              </div>
              
              {invoiceUrl ? (
                <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                  <Button
                    variant="link"
                    className="text-primary hover:underline flex items-center gap-2 text-sm p-0 h-auto"
                    onClick={async () => {
                      // Extract storage path - handle both old full URLs and new path-only values
                      let storagePath = invoiceUrl;
                      if (invoiceUrl.startsWith('http')) {
                        // Old-style full URL: extract path after /object/public/invoices/
                        const match = invoiceUrl.match(/\/invoices\/(.+)$/);
                        storagePath = match ? match[1] : invoiceUrl;
                      }
                       try {
                         const { data, error } = await supabase.storage
                           .from('invoices')
                           .createSignedUrl(storagePath, 300);
                         if (error || !data?.signedUrl) {
                           toast.error('Failed to open invoice. Please disable ad blocker and try again.');
                           return;
                         }
                        // Fetch as blob and render inside an in-app viewer dialog
                        // (same pattern used for HR documents). Avoids new-tab/blob
                        // navigation issues caused by ad blockers or Chrome.
                        const fileName = storagePath.split('/').pop() || 'Invoice';
                        const fileType = (fileName.split('.').pop() || '').toLowerCase();
                        try {
                          const res = await fetch(data.signedUrl);
                          if (!res.ok) throw new Error(`HTTP ${res.status}`);
                          const blob = await res.blob();
                          const blobUrl = URL.createObjectURL(blob);
                          // Revoke previous blob URL if any
                          if (invoiceViewer.url) URL.revokeObjectURL(invoiceViewer.url);
                          setInvoiceViewer({ open: true, url: blobUrl, name: fileName, fileType });
                        } catch (fetchErr) {
                          // Fallback: open viewer with the signed URL directly
                          setInvoiceViewer({ open: true, url: data.signedUrl, name: fileName, fileType });
                        }
                       } catch (err: any) {
                         console.error('Error opening invoice:', err);
                         toast.error('Failed to open invoice. Please disable ad blocker and try again.');
                       }
                    }}
                  >
                    <FileText className="h-4 w-4" />
                    View Invoice
                    <ExternalLink className="h-3 w-3" />
                  </Button>
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

              {/* PO Number - editable */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">PO No:</span>
                {editingPoNumber ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={poNumber}
                      onChange={(e) => setPoNumber(e.target.value)}
                      placeholder="Enter PO number"
                      className="h-7 text-sm flex-1"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={async () => {
                        if (order) {
                          await onUpdate(order.id, { po_number: poNumber || null });
                        }
                        setEditingPoNumber(false);
                      }}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingPoNumber(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{poNumber || '—'}</span>
                    {canEditOrder && (
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => setEditingPoNumber(true)}>
                        Edit
                      </Button>
                    )}
                  </div>
                )}
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

            {/* Notes (Read-only display when not in edit mode) */}
            {/* Inventory Fulfillment Section */}
            {order && <InventoryFulfillmentPanel orderId={order.id} productName={order.product_name} />}

            {!canEditOrder && (order.sales_notes || order.customer_notes) && (
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

            {/* Edit Form (Supply Chain / Admin / Sales for own orders) */}
            {canEditOrder && (
              <div className="space-y-4 border-t pt-4">
                <h4 className="font-medium">
                  {isOwnOrder && !canEdit ? 'Update Your Order' : 'Update Order'}
                </h4>

                {/* Supply Chain / Admin only fields */}
                {canEdit && (
                  <>
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
                  </>
                )}

                {/* Fields editable by both Sales (own orders) and Supply Chain */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer_name">Customer Name</Label>
                    <Input
                      id="customer_name"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      disabled={loading}
                      placeholder="Customer name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer_company">Company Name</Label>
                    <Input
                      id="customer_company"
                      value={customerCompany}
                      onChange={e => setCustomerCompany(e.target.value)}
                      disabled={loading}
                      placeholder="Company name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer_gst">GST Number <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                  <Input
                    id="customer_gst"
                    value={customerGst}
                    onChange={e => setCustomerGst(e.target.value.toUpperCase())}
                    disabled={loading}
                    placeholder="e.g., 29ABCDE1234F1Z5"
                    maxLength={15}
                  />
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

                {/* Financial fields - Supply Chain / Admin only */}
                {canEdit && (
                  <>
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
                    <Label htmlFor="courier_name">Courier Name</Label>
                    <CourierCombobox
                      id="courier_name"
                      value={courierName}
                      onChange={setCourierName}
                      disabled={loading}
                      placeholder="Select courier…"
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

                {/* Refund Section - Supply Chain / Admin only */}
                {canEdit && (
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
                )}
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
                {canEditOrder ? 'Cancel' : 'Close'}
              </Button>
              {canEditOrder && (
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

      <Dialog open={productNameReasonOpen} onOpenChange={(o) => { if (!loading) setProductNameReasonOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reason for Product Name Change</DialogTitle>
            <DialogDescription>
              Please provide a reason for changing the product name. This will be logged in the order's edit history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="product-name-reason">Reason</Label>
            <Textarea
              id="product-name-reason"
              value={productNameReason}
              onChange={(e) => setProductNameReason(e.target.value)}
              placeholder="e.g. Customer requested variant change, wrong SKU captured from website, etc."
              rows={3}
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setProductNameReasonOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!productNameReason.trim()) {
                  toast.error('Please enter a reason');
                  return;
                }
                void commitOrderItemEdits(productNameReason.trim());
              }}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DocumentViewer
        open={invoiceViewer.open}
        onOpenChange={(o) => {
          if (!o && invoiceViewer.url?.startsWith('blob:')) {
            const u = invoiceViewer.url;
            setTimeout(() => URL.revokeObjectURL(u), 1000);
          }
          setInvoiceViewer((prev) => ({ ...prev, open: o }));
        }}
        url={invoiceViewer.url}
        name={invoiceViewer.name}
        fileType={invoiceViewer.fileType}
      />
    </>
  );
}
