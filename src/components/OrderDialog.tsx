import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OrderAttributionPanel } from '@/components/orders/OrderAttributionPanel';
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
import { Loader2, Package, User, Building2, Truck, Calendar, ExternalLink, Trash2, TrendingUp, Clock, CreditCard, MapPin, Upload, FileText, X, ShoppingCart, RotateCcw, AlertTriangle, Flag, Trophy, XCircle, Undo2, CalendarIcon, Pencil, Check, Phone, Mail, Globe, RefreshCw } from 'lucide-react';
import { OrderNumberBadge } from '@/components/OrderNumberBadge';
import { LeadSourceBadge } from '@/components/LeadSourceBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OrderSupplierPayments } from '@/components/OrderSupplierPayments';
import { EditHistoryPanel } from '@/components/EditHistoryPanel';
import { OrderActivityTimeline } from '@/components/OrderActivityTimeline';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { ProductSelect } from '@/components/ProductSelect';
import { PricelistItem } from '@/hooks/usePricelist';
import { InventoryFulfillmentPanel } from '@/components/order/InventoryFulfillmentPanel';
import { DocumentViewer } from '@/components/hr/DocumentViewer';
import { useOrderInvoices, OrderInvoice } from '@/hooks/useOrderInvoices';
import { WooOrderStatusActions } from '@/components/orders/WooOrderStatusActions';
import { GenerateProformaDialog } from '@/components/orders/GenerateProformaDialog';
import { InvoiceListCard } from '@/components/orders/InvoiceListCard';
import { ZohoInvoiceCard } from '@/components/orders/ZohoInvoiceCard';
import { InvoiceEmailControl, defaultEmailState, validateEmailState, InvoiceEmailState } from '@/components/orders/InvoiceEmailControl';
import { sendInvoiceEmail } from '@/lib/invoiceEmail';
import { KycInviteBadge } from '@/components/orders/KycInviteBadge';
import { CompanyOwnerPicker } from '@/components/crm/CompanyOwnerPicker';
import { useSalesUsers } from '@/hooks/useSalesUsers';

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

const outcomeConfig: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' },
  won: { label: 'Won', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  lost: { label: 'Lost', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  // Legacy / DB short codes used on cancelled or completed orders
  OW: { label: 'Won', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  OL: { label: 'Lost', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
};

const FALLBACK_OUTCOME_CONFIG = {
  label: 'Unknown',
  className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

const isWonOutcome = (o: string | null | undefined) => o === 'won' || o === 'OW';

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
  const [refreshingPrices, setRefreshingPrices] = useState(false);
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
  const [deleteReason, setDeleteReason] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleReasonOpen, setTitleReasonOpen] = useState(false);
  const [titleReason, setTitleReason] = useState('');

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
  const [dispatchedOn, setDispatchedOn] = useState('');
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
  // Multi-invoice support
  const { invoices: orderInvoices, addInvoice, removeInvoice, refetch: refetchInvoices } = useOrderInvoices(order?.id ?? null);
  const [proformaDialogOpen, setProformaDialogOpen] = useState(false);
  const [regenerateTarget, setRegenerateTarget] = useState<OrderInvoice | null>(null);
  // Proforma can be generated regardless of payment status (full/partial/none).
  // Payment approval is NOT required to issue a proforma invoice.
  const canGenerateProforma = isAdmin || isFinance || isSupplyChain || isSales;
  const canBypassInvoiceEmail = isAdmin || isFinance;
  const [invoiceEmailState, setInvoiceEmailState] = useState<InvoiceEmailState>(defaultEmailState(''));
  // (PO number is auto-extracted from the uploaded PO document; no manual editing)
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
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [salesPersonId, setSalesPersonId] = useState<string | null>(null);
  const [salesPersonName, setSalesPersonName] = useState<string | null>(null);

  // Live Woo status (only populated for website-sourced orders). Lets us
  // render the WooOrderStatusActions control inside the manual dialog so
  // staff can push status changes back to WooCommerce without leaving
  // this screen.
  const isWebsiteOrder = (order as any)?.source === 'website';
  const wooOrderId = (order as any)?.external_id ? String((order as any).external_id) : null;
  const [wooStatus, setWooStatus] = useState<string | null>(null);
  // Ref to the Tracking Information card — used to auto-scroll the user there
  // when they try to mark a website order as Shipped without tracking.
  const trackingSectionRef = useRef<HTMLDivElement>(null);
  const focusTrackingSection = () => {
    setEditingTracking(true);
    setTimeout(() => {
      trackingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };
  useEffect(() => {
    if (!isWebsiteOrder || !wooOrderId || !open) {
      setWooStatus(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('woocommerce_orders')
        .select('order_status')
        .eq('woo_order_id', wooOrderId)
        .maybeSingle();
      if (!cancelled) setWooStatus((data as any)?.order_status ?? null);
    })();
    return () => { cancelled = true; };
  }, [isWebsiteOrder, wooOrderId, open]);

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
      setDispatchedOn(((order as any).dispatched_on as string) || '');
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
      setCustomerPhone((order as any).customer_phone || '');
      setCustomerEmail((order as any).customer_email || '');
      setSalesPersonId(order.sales_person_id ?? null);
      setSalesPersonName(order.sales_person_name ?? null);
      setInvoiceEmailState(defaultEmailState((order as any).customer_email || ''));
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
    // Validate email control BEFORE upload
    let emailPlan: { mode: 'auto' | 'skip'; email?: string; bypassReason?: string };
    try {
      emailPlan = validateEmailState(invoiceEmailState);
    } catch (e: any) {
      toast.error(e.message);
      if (invoiceInputRef.current) invoiceInputRef.current.value = '';
      return;
    }
    setInvoiceUploading(true);
    try {
      // Persist email back to the order before upload (so future flows have it)
      if (emailPlan.mode === 'auto' && emailPlan.email && emailPlan.email !== (order as any).customer_email) {
        await supabase.from('orders').update({ customer_email: emailPlan.email }).eq('id', order.id);
        setCustomerEmail(emailPlan.email);
      }
      const inserted = await addInvoice(file, user.id);
      if (inserted) {
        // Note: do NOT mirror onto orders.invoice_url anymore — order_invoices is the
        // source of truth. Mirroring caused older invoices to appear "lost" whenever
        // invoice_url was overwritten or cleared elsewhere.
        setInvoiceUrl(inserted.storage_path);
        // Fire-and-forget email (never blocks save)
        if (emailPlan.mode === 'auto') {
          sendInvoiceEmail({
            invoice_id: inserted.id,
            to_email: emailPlan.email,
            mode: 'auto',
          }).catch(() => {});
        } else {
          sendInvoiceEmail({
            invoice_id: inserted.id,
            mode: 'skip',
            bypass_reason: emailPlan.bypassReason,
            silent: true,
          }).catch(() => {});
        }
      }
    } finally {
      setInvoiceUploading(false);
      if (invoiceInputRef.current) {
        invoiceInputRef.current.value = '';
      }
    }
  };

  // Legacy single-invoice removal removed — invoices are now managed exclusively
  // through the order_invoices table via removeInvoice() per file.

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

        // Trigger AI extraction of PO number (best-effort, non-blocking)
        supabase.functions
          .invoke('extract-po-number', {
            body: { order_id: order.id, storage_path: filePath },
          })
          .then(({ data, error }) => {
            if (error) {
              console.warn('PO number extraction failed:', error);
              return;
            }
            if (data?.po_number) {
              setPoNumber(data.po_number);
            }
          });
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

      // When the last PO file is removed, also clear the auto-extracted PO number
      // so we don't leave a stale number with no document attached.
      const updatePayload: any = { po_url: newPoUrl };
      if (!newPoUrl) updatePayload.po_number = null;

      const success = await onUpdate(order.id, updatePayload);
      if (success) {
        setPoUrl(newPoUrl);
        if (!newPoUrl) setPoNumber('');
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
      customer_phone: customerPhone || null,
      customer_email: customerEmail || null,
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
      dispatched_on: dispatchedOn || null,
      internal_notes: internalNotes || null,
      customer_notes: customerNotes || null,
      sales_notes: salesNotes || null,
      // invoice_url intentionally omitted — invoices are persisted in the
      // order_invoices table and must never be touched by the main order form save.
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
    trackField('customer_phone', (order as any).customer_phone, customerPhone || null);
    trackField('customer_email', (order as any).customer_email, customerEmail || null);
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
    trackField('dispatched_on', (order as any).dispatched_on, dispatchedOn || null);
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

    // When the status of a website order is manually changed, set
    // procurement_edited = true so the Woo mirror stops overwriting it
    // on subsequent webhook / backfill syncs.
    if (
      (order as any).source === 'website' &&
      changes['status'] &&
      !(order as any).procurement_edited
    ) {
      (updates as any).procurement_edited = true;
    }

    const success = await onUpdate(order.id, updates);
    
    // Record edit history
    if (success && Object.keys(changes).length > 0) {
      await recordChanges('orders', order.id, changes, profile?.name || 'Unknown');
    }

    // Mirror tracking changes to the linked WooCommerce order so the
    // website-order tracking card stays in sync.
    if (
      success &&
      (order as any).source === 'website' &&
      order.order_number &&
      (changes['tracking_number'] || changes['tracking_url'] || changes['courier_name'] || changes['status'])
    ) {
      const wooUpdate: Record<string, any> = {};
      if (changes['tracking_number']) wooUpdate.tracking_number = trackingNumber || null;
      if (changes['courier_name']) wooUpdate.courier = courierName || null;
      if (changes['status']) {
        if (finalStatus === 'in_transit') wooUpdate.tracking_status = 'in_transit';
        else if (finalStatus === 'delivery_done') wooUpdate.tracking_status = 'delivered';
      } else if (changes['tracking_number'] && trackingNumber) {
        wooUpdate.tracking_status = 'in_transit';
      }
      if (Object.keys(wooUpdate).length > 0) {
        await supabase
          .from('woocommerce_orders')
          .update(wooUpdate)
          .eq('order_number', order.order_number);
      }

      // Push the tracking/courier/url change to WooCommerce itself so it
      // shows up in the official "Shipment Tracking" panel and on the
      // customer-facing order page. Best-effort: failures are surfaced as a
      // toast but don't roll back the local save.
      if (changes['tracking_number'] || changes['tracking_url'] || changes['courier_name']) {
        const wooOrderId = (order as any).external_id || order.order_number;
        if (wooOrderId && /^\d+$/.test(String(wooOrderId))) {
          try {
            const { error: pushErr } = await supabase.functions.invoke(
              'update-woo-order-status',
              {
                body: {
                  woo_order_id: String(wooOrderId),
                  tracking_carrier: courierName || undefined,
                  tracking_number: trackingNumber || undefined,
                  tracking_url: trackingUrl || undefined,
                  expected_delivery: undefined,
                },
              },
            );
            if (pushErr) {
              toast.error(`Saved locally but Woo push failed: ${pushErr.message}`);
            }
          } catch (e: any) {
            toast.error(`Saved locally but Woo push failed: ${e?.message || 'unknown'}`);
          }
        }
      }
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

  const refreshPricesFromPricelist = async () => {
    if (!order) return;
    setRefreshingPrices(true);
    try {
      // Legacy fallback: orders with no order_items rows — use the order header product_name
      const usingHeader = orderItems.length === 0;
      const names = usingHeader
        ? (order.product_name ? [order.product_name] : [])
        : Array.from(new Set(orderItems.map((i) => i.product_name).filter(Boolean)));
      if (names.length === 0) {
        toast.info('No products to refresh');
        return;
      }
      const { data: priceRows, error: priceErr } = await supabase
        .from('pricelist')
        .select('product_name, dealer_price, website_price, unit_price')
        .in('product_name', names);
      if (priceErr) throw priceErr;

      const priceMap = new Map<string, number>();
      (priceRows || []).forEach((row: any) => {
        const next = row.dealer_price ?? row.website_price ?? row.unit_price;
        if (next != null) priceMap.set(row.product_name, Number(next));
      });

      let updated = 0;
      let unchanged = 0;
      let missing = 0;
      const changesByItem: Array<{ id: string; old: number | null; next: number; name: string }> = [];

      if (usingHeader) {
        const next = priceMap.get(order.product_name!);
        if (next == null) {
          missing = 1;
        } else {
          const qty = order.quantity || 1;
          const oldSelling = (order as any).selling_price ?? null;
          const oldTotal = (order as any).total_sales_amount ?? null;
          const nextTotal = next * qty;
          if (Number(oldSelling) === next && Number(oldTotal) === nextTotal) {
            unchanged = 1;
          } else {
            const { data, error } = await supabase
              .from('orders')
              .update({ selling_price: next, total_sales_amount: nextTotal })
              .eq('id', order.id)
              .select('id')
              .maybeSingle();
            if (error) throw error;
            if (!data) throw new Error('No rows updated (insufficient permission)');
            if (user && profile) {
              await recordChanges('orders', order.id, {
                selling_price: { old: oldSelling, new: next },
                total_sales_amount: { old: oldTotal, new: nextTotal },
              }, profile.name || 'Unknown');
            }
            await onUpdate(order.id, { selling_price: next, total_sales_amount: nextTotal } as Partial<Order>);
            updated = 1;
          }
        }
      } else {
      for (const item of orderItems) {
        const next = priceMap.get(item.product_name);
        if (next == null) {
          missing += 1;
          continue;
        }
        if (Number(item.unit_price) === next) {
          unchanged += 1;
          continue;
        }
        const { data, error } = await supabase
          .from('order_items')
          .update({ unit_price: next })
          .eq('id', item.id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('No rows updated (insufficient permission)');
        changesByItem.push({ id: item.id, old: item.unit_price ?? null, next, name: item.product_name });
        updated += 1;
      }

      if (updated > 0 && user && profile) {
        const changesRecord: Record<string, { old: any; new: any }> = {};
        changesByItem.forEach((c) => {
          changesRecord[`order_item.unit_price (${c.name})`] = { old: c.old, new: c.next };
        });
        await recordChanges('orders', order.id, changesRecord, profile.name || 'Unknown');
      }

      const refreshedItems = await fetchOrderItems(order.id);
      setOrderItems(refreshedItems);
      }

      const parts: string[] = [];
      parts.push(`${updated} updated`);
      if (unchanged) parts.push(`${unchanged} unchanged`);
      if (missing) parts.push(`${missing} not in pricelist`);
      toast.success(`Prices refreshed — ${parts.join(', ')}`);
    } catch (error: any) {
      console.error('Error refreshing prices from pricelist:', error);
      toast.error(error.message || 'Failed to refresh prices');
    } finally {
      setRefreshingPrices(false);
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

  const commitTitleEdit = async (reason: string) => {
    if (!order) return;
    const newName = titleDraft.trim();
    if (!newName || newName === order.product_name) {
      setTitleReasonOpen(false);
      setEditingTitle(false);
      return;
    }
    setLoading(true);
    try {
      const oldName = order.product_name;
      const { error } = await supabase
        .from('orders')
        .update({ product_name: newName })
        .eq('id', order.id);
      if (error) throw error;

      // Mirror to any order_items that match the old header name
      const matchingItems = orderItems.filter(i => i.product_name === oldName);
      for (const item of matchingItems) {
        await supabase
          .from('order_items')
          .update({ product_name: newName })
          .eq('id', item.id);
      }

      if (user && profile) {
        await recordChanges('orders', order.id, {
          product_name: { old: oldName, new: newName },
          product_name_change_reason: { old: null, new: reason },
        }, profile.name || 'Unknown');
      }

      await onUpdate(order.id, { product_name: newName } as Partial<Order>);
      const refreshedItems = await fetchOrderItems(order.id);
      setOrderItems(refreshedItems);
      toast.success('Order title updated');
    } catch (e: any) {
      console.error('Failed to update order title', e);
      toast.error(e?.message || 'Failed to update order title');
    } finally {
      setLoading(false);
      setTitleReasonOpen(false);
      setTitleReason('');
      setEditingTitle(false);
    }
  };

  const paymentConfig = paymentStatusConfig[order.payment_status];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto !block">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  {editingTitle && canEditOrder ? (
                    <>
                      <Input
                        autoFocus
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        className="h-8 text-base font-semibold w-[320px]"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (titleDraft.trim() && titleDraft.trim() !== order.product_name) {
                              setTitleReasonOpen(true);
                            } else {
                              setEditingTitle(false);
                            }
                          } else if (e.key === 'Escape') {
                            setEditingTitle(false);
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          if (titleDraft.trim() && titleDraft.trim() !== order.product_name) {
                            setTitleReasonOpen(true);
                          } else {
                            setEditingTitle(false);
                          }
                        }}
                        title="Save"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => setEditingTitle(false)}
                        title="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      {order.product_name}
                      {canEditOrder && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            setTitleDraft(order.product_name || '');
                            setEditingTitle(true);
                          }}
                          title="Edit title"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <OrderNumberBadge orderNumber={order.order_number} size="md" />
                    </>
                  )}
                  {canEditOrder && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={refreshPricesFromPricelist}
                      disabled={refreshingPrices || loading}
                      className="ml-auto h-8 gap-1"
                      title="Refresh prices from current pricelist"
                    >
                      {refreshingPrices ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Refresh Prices
                    </Button>
                  )}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2 mt-1 flex-wrap">
                  {order.product_category}
                  <LeadSourceBadge source={order.lead_source || (order as any).source} size="sm" />
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
                  {order.order_outcome && order.order_outcome !== 'pending' && (() => {
                    const cfg = outcomeConfig[order.order_outcome] ?? FALLBACK_OUTCOME_CONFIG;
                    return (
                      <Badge className={cfg.className}>
                        {isWonOutcome(order.order_outcome) ? <Trophy className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                        {cfg.label}
                      </Badge>
                    );
                  })()}
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
                  <KycInviteBadge
                    orderId={order.id}
                    customerEmail={customerEmail || (order as any).customer_email}
                  />
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

            {/* WooCommerce sync — only for website-sourced orders. Lets the
                user push the order to any Woo status (Processing, Shipped,
                Completed, etc.) directly from the unified Order dialog. The
                update-woo-order-status edge function mirrors the change back
                into woocommerce_orders so the Website Orders tab stays in
                sync. */}
            {isWebsiteOrder && wooOrderId && (
              <div className="p-4 bg-muted/40 rounded-lg border border-primary/20 space-y-3">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <span className="font-medium">WooCommerce Status</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    Woo Order #{wooOrderId}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Change the live status on xboom.in. Customers receive Woo's
                  email notifications automatically.
                </p>
                <WooOrderStatusActions
                  wooOrderId={wooOrderId}
                  currentStatus={wooStatus}
                  variant="full"
                  stopPropagation={false}
                  onUpdated={(newStatus) => setWooStatus(newStatus)}
                  hasTracking={
                    !!((order.tracking_number || trackingNumber) &&
                       ((order as any).courier_name || courierName))
                  }
                  tracking={{
                    carrier: courierName || (order as any).courier_name || null,
                    number: trackingNumber || order.tracking_number || null,
                    url: trackingUrl || order.tracking_url || null,
                    expected: null,
                  }}
                  onTrackingNeeded={focusTrackingSection}
                />
              </div>
            )}

            {isWebsiteOrder && (
              <OrderAttributionPanel internalOrderId={order.id} isMirroredAndPaid />
            )}

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
                  <div className="space-y-2">
                    <Label htmlFor="inline_customer_phone">
                      Mobile <span className="text-destructive">*</span>{' '}
                      <span className="text-muted-foreground text-xs">(for SMS updates)</span>
                    </Label>
                    <Input
                      id="inline_customer_phone"
                      type="tel"
                      inputMode="tel"
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      disabled={loading}
                      placeholder="+91 98765 43210"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inline_customer_email">Email <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                    <Input
                      id="inline_customer_email"
                      type="email"
                      value={customerEmail}
                      onChange={e => setCustomerEmail(e.target.value)}
                      disabled={loading}
                      placeholder="customer@example.com"
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
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Mobile:</span>
                    {(customerPhone || (order as any).customer_phone) ? (
                      <a
                        href={`tel:${customerPhone || (order as any).customer_phone}`}
                        className="font-medium font-mono text-primary hover:underline"
                      >
                        {customerPhone || (order as any).customer_phone}
                      </a>
                    ) : (
                      <span className="italic text-destructive">Missing — required for SMS updates. Click edit to add.</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Email:</span>
                    {(customerEmail || (order as any).customer_email) ? (
                      <span className="font-medium truncate">{customerEmail || (order as any).customer_email}</span>
                    ) : (
                      <span className="italic text-muted-foreground">Not provided</span>
                    )}
                  </div>
                  {canSeeProcurement && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Sales:</span>
                      {isAdmin ? (
                        <ReassignSalespersonControl
                          orderId={order.id}
                          currentId={order.sales_person_id ?? null}
                          currentName={order.sales_person_name ?? null}
                          onUpdate={onUpdate}
                        />
                      ) : (
                        <span className="font-medium">{order.sales_person_name}</span>
                      )}
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
                    <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={refreshPricesFromPricelist}
                      disabled={refreshingPrices || loading}
                      className="h-8 gap-1"
                      title="Refresh prices from current pricelist"
                    >
                      {refreshingPrices ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Refresh Prices
                    </Button>
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
                    </>
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
            <div ref={trackingSectionRef} className="p-4 bg-muted/50 rounded-lg space-y-3 scroll-mt-20">
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
                    <Label htmlFor="inline_dispatched_on">Dispatched On</Label>
                    <Input
                      id="inline_dispatched_on"
                      type="date"
                      value={dispatchedOn}
                      onChange={e => setDispatchedOn(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {(courierName || (order as any).courier_name) && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Courier:</span>
                      <span className="font-medium">{courierName || (order as any).courier_name}</span>
                    </div>
                  )}
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
                  {(dispatchedOn || (order as any).dispatched_on) && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Dispatched On:</span>
                      <span>{format(new Date(dispatchedOn || (order as any).dispatched_on), 'dd MMM yyyy')}</span>
                    </div>
                  )}
                  {(trackingUrl || order.tracking_url) && !(trackingNumber || order.tracking_number) && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Tracking Link:</span>
                      <a
                        href={trackingUrl || order.tracking_url || ''}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        Track shipment
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  {!trackingNumber && !order.tracking_number && !courierName && !(order as any).courier_name && !(trackingUrl || order.tracking_url) && !dispatchedOn && !(order as any).dispatched_on && (
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
                {canGenerateProforma && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setProformaDialogOpen(true)}
                  >
                    <FileText className="h-4 w-4 mr-1" /> Generate Proforma
                  </Button>
                )}
              </div>

              {/* Invoice Numbers (auto-extracted, read-only) */}
              <div className="flex items-start gap-2 text-sm">
                <span className="text-muted-foreground shrink-0">Invoice No:</span>
                <span className="font-mono font-medium break-all">
                  {orderInvoices.filter(i => i.invoice_number).map(i => i.invoice_number).join(', ') || '—'}
                </span>
              </div>

              {/* List of uploaded invoices */}
              {orderInvoices.length > 0 && (
                <InvoiceListCard
                  invoices={orderInvoices}
                  canRegenerate={!!canGenerateProforma}
                  onRegenerate={(inv) => { setRegenerateTarget(inv); setProformaDialogOpen(true); }}
                  canDelete={canEdit}
                  onDelete={(inv) => removeInvoice(inv)}
                />
              )}

              {/* Zoho Books linked invoice */}
              <ZohoInvoiceCard orderNumber={order?.order_number} />

              {canEdit ? (
                <div>
                  <InvoiceEmailControl
                    state={invoiceEmailState}
                    onChange={setInvoiceEmailState}
                    canBypass={canBypassInvoiceEmail}
                    className="mb-3"
                  />
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
                        {orderInvoices.length > 0 ? 'Upload Another Invoice' : 'Upload Invoice'}
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Supports PDF, PNG, JPG (max 10MB). Invoice number is auto-extracted.
                  </p>
                </div>
              ) : orderInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoice attached</p>
              ) : null}
            </div>

            {/* Purchase Order Section */}
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Purchase Order (PO)
                </h4>
              </div>

              {/* PO Number (auto-extracted from uploaded PO, read-only) */}
              <div className="flex items-start gap-2 text-sm">
                <span className="text-muted-foreground shrink-0">PO No:</span>
                <span className="font-mono font-medium break-all">
                  {poNumber || '—'}
                </span>
              </div>
              
              {poUrl ? (
                <div className="space-y-2">
                  {poUrl.split(',').map((url, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                      <button
                        type="button"
                        onClick={async () => {
                          const trimmed = url.trim();
                          const m = trimmed.match(/purchase-orders\/(.+)$/);
                          const path = m ? m[1] : null;
                          if (!path) {
                            toast.error('Invalid PO document URL');
                            return;
                          }
                          try {
                            const { data, error } = await supabase.storage
                              .from('purchase-orders')
                              .createSignedUrl(path, 300);
                            if (error || !data?.signedUrl) {
                              toast.error('Unable to open PO document');
                              return;
                            }
                            const fileName = path.split('/').pop() || `PO Document ${idx + 1}`;
                            const fileType = (fileName.split('.').pop() || '').toLowerCase();
                            try {
                              const res = await fetch(data.signedUrl);
                              if (!res.ok) throw new Error(`HTTP ${res.status}`);
                              const blob = await res.blob();
                              const blobUrl = URL.createObjectURL(blob);
                              if (invoiceViewer.url) URL.revokeObjectURL(invoiceViewer.url);
                              setInvoiceViewer({ open: true, url: blobUrl, name: fileName, fileType });
                            } catch {
                              setInvoiceViewer({ open: true, url: data.signedUrl, name: fileName, fileType });
                            }
                          } catch (err: any) {
                            console.error('Error opening PO:', err);
                            toast.error('Failed to open PO document');
                          }
                        }}
                        className="text-primary hover:underline flex items-center gap-2 text-sm truncate flex-1 text-left"
                      >
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="truncate">PO Document {idx + 1}</span>
                      </button>
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

          {/* Activity timeline (unified) */}
          <OrderActivityTimeline orderId={order.id} />

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
              The order will be moved to the <strong>Deleted Orders</strong> tab. You can restore it later from there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="delete-reason">Reason for deletion <span className="text-destructive">*</span></Label>
            <Textarea
              id="delete-reason"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g. Duplicate order, customer cancelled, test entry, etc."
              rows={3}
              disabled={loading}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading} onClick={() => setDeleteReason('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={loading || !deleteReason.trim()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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

      <GenerateProformaDialog
        order={order}
        open={proformaDialogOpen}
        existingProforma={regenerateTarget}
        onOpenChange={(o) => {
          setProformaDialogOpen(o);
          if (!o) setRegenerateTarget(null);
        }}
        onGenerated={() => { refetchInvoices(); setRegenerateTarget(null); }}
      />

      <Dialog open={titleReasonOpen} onOpenChange={(o) => { if (!loading) setTitleReasonOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reason for Title Change</DialogTitle>
            <DialogDescription>
              Please provide a reason for changing the order title. This will be logged in the order's edit history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="title-change-reason">Reason</Label>
            <Textarea
              id="title-change-reason"
              value={titleReason}
              onChange={(e) => setTitleReason(e.target.value)}
              placeholder="e.g. Customer requested variant change, corrected product name, etc."
              rows={3}
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTitleReasonOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!titleReason.trim()) {
                  toast.error('Please enter a reason');
                  return;
                }
                void commitTitleEdit(titleReason.trim());
              }}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReassignSalespersonControl({
  orderId,
  currentId,
  currentName,
  onUpdate,
}: {
  orderId: string;
  currentId: string | null;
  currentName: string | null;
  onUpdate: (orderId: string, updates: Partial<Order>) => Promise<boolean>;
}) {
  const { salesUsers } = useSalesUsers();
  const [saving, setSaving] = useState(false);

  const handleChange = async (userId: string | null) => {
    if (userId === currentId) return;
    const selected = userId ? salesUsers.find((u) => u.user_id === userId) : null;
    setSaving(true);
    try {
      const ok = await onUpdate(orderId, {
        sales_person_id: userId,
        sales_person_name: selected?.name ?? null,
      } as Partial<Order>);
      if (ok) {
        toast.success(
          selected ? `Reassigned to ${selected.name}` : 'Salesperson unassigned',
        );
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reassign salesperson');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <CompanyOwnerPicker
        ownerId={currentId}
        ownerName={currentName}
        onChange={handleChange}
      />
      {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
    </div>
  );
}
