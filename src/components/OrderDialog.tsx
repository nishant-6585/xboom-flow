import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OrderAttributionPanel } from '@/components/orders/OrderAttributionPanel';
import { OrderConfirmationStatusBanner } from '@/components/orders/OrderConfirmationStatusBanner';
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
import { usePaymentRecords } from '@/hooks/usePaymentRecords';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { DeliveryProofCard } from '@/components/orders/DeliveryProofCard';
import { useEditHistory } from '@/hooks/useEditHistory';
import { useOrderItems, ORDER_ITEM_STATUSES } from '@/hooks/useOrderItems';
import { useSuppliers } from '@/hooks/useSuppliers';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { calculatePaymentDueDate } from '@/lib/paymentTerms';
import { toast } from 'sonner';
import { isValidHttpUrl } from '@/lib/urlValidation';
import { emailError as emailErrorInline, phoneError as phoneErrorInline, validateEmail, validatePhone } from '@/lib/contactValidation';
import { COURIER_NAMES, buildTrackingUrl } from '@/lib/courierTracking';
import { CourierCombobox } from '@/components/CourierCombobox';
import { stripHtmlLabel } from '@/lib/stripHtml';
import { Loader2, Package, User, Building2, Truck, Calendar, ExternalLink, Trash2, TrendingUp, Clock, CreditCard, MapPin, Upload, FileText, X, ShoppingCart, RotateCcw, AlertTriangle, Flag, Trophy, XCircle, Undo2, CalendarIcon, Pencil, Check, Phone, Mail, Globe, RefreshCw, Plus } from 'lucide-react';
import { OrderNumberBadge } from '@/components/OrderNumberBadge';
import { LeadSourceBadge } from '@/components/LeadSourceBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OrderSupplierPayments } from '@/components/OrderSupplierPayments';
import { EditHistoryPanel } from '@/components/EditHistoryPanel';
import { OrderActivityTimeline } from '@/components/OrderActivityTimeline';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { NormalizedFromWebsiteBadge } from '@/components/orders/NormalizedFromWebsiteBadge';
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
import { useZohoBooksInvoicesForOrder } from '@/hooks/useZohoBooksInvoicesForOrder';
import { InvoiceEmailControl, defaultEmailState, validateEmailState, InvoiceEmailState } from '@/components/orders/InvoiceEmailControl';
import { sendInvoiceEmail } from '@/lib/invoiceEmail';
import { KycInviteBadge } from '@/components/orders/KycInviteBadge';
import { CompanyOwnerPicker } from '@/components/crm/CompanyOwnerPicker';
import { useSalesUsers } from '@/hooks/useSalesUsers';
import { canMarkDeliveryDone } from '@/lib/deliveryProofGuard';

interface OrderDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (orderId: string, updates: Partial<Order>) => Promise<boolean>;
  onDelete: (orderId: string) => Promise<boolean>;
  onEscalate?: (orderId: string, reason: string) => Promise<boolean>;
  /** Optional callback to refetch the underlying orders list. Called when
   *  the open order changes underneath us (realtime UPDATE) or the window
   *  regains focus. Scoped to the currently-open order only. */
  onRefresh?: () => void;
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

export function OrderDialog({ order, open, onOpenChange, onUpdate, onDelete, onEscalate, onRefresh }: OrderDialogProps) {
  const { role, user, profile } = useAuth();
  const queryClient = useQueryClient();
  const { fetchOrderItems } = useOrderItems();
  const { suppliers } = useSuppliers();
  const { recordChanges } = useEditHistory();
  const isAdmin = role === 'admin';
  const isSales = role === 'sales';
  const isSupplyChain = role === 'supply_chain';
  const isFinance = role === 'finance';
  const isSalesManager = role === 'sales_manager';
  // Sales and Supply Chain now have full field editing access
  const canEdit = isSupplyChain || isAdmin || isFinance || isSales;
  const isOwnOrder = isSales && order?.sales_person_id === user?.id;
  const canEditSalesFields = canEdit;
  const { salesUsers } = useSalesUsers();
  // Combined edit permission - all roles with canEdit can edit all fields
  const canEditOrder = canEdit;
  const canDelete = isAdmin || isSupplyChain;
  const canSeeProcurement = isSupplyChain || isAdmin || isFinance;
  const canEscalate = isSales && onEscalate;
  // --- Per-role financial field classification (guard_orders_sensitive_updates) ---
  // Direct hand-edits to selling_price / total_sales_amount / amount_paid /
  // payment_status are reserved for admin + sales_manager. Sales sees them
  // read-only. Discount is the salesperson's lever on OWN orders.
  const canEditFinancials = isAdmin || isSalesManager;
  const canEditDiscount = canEditFinancials || isOwnOrder;
  const [hasPriceRefreshGrant, setHasPriceRefreshGrant] = useState(false);
  const canRefreshPrice = canEditFinancials || hasPriceRefreshGrant;
  useEffect(() => {
    if (!user?.id) { setHasPriceRefreshGrant(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('price_refresh_grants')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!cancelled) setHasPriceRefreshGrant(!!data);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

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
  // Line items added during the current edit session (not yet persisted).
  // Each has a stable client-side id prefixed with `new-` so React keys are stable
  // and we can distinguish them from persisted rows in commitOrderItemEdits.
  const [newOrderItems, setNewOrderItems] = useState<Array<{
    id: string;
    product_name: string;
    product_category: string;
    quantity: number;
    unit_price: string;
    status: string;
    notes: string;
    procurement_rate: string;
    supplier_id: string;
    discount_amount: string;
  }>>([]);
  // Line items removed during the current edit session — deleted on save.
  const [deletedOrderItemIds, setDeletedOrderItemIds] = useState<Set<string>>(new Set());
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
  const { invoices: zohoMirrorInvoices, loading: zohoMirrorLoading } = useZohoBooksInvoicesForOrder(order?.order_number ?? null);

  // Merge Zoho Books mirror rows into the attached invoices they refer to.
  // Match by zoho_invoice_id first, then by invoice_number.
  const zohoMetaByAttachmentId: Record<string, typeof zohoMirrorInvoices[number]> = {};
  const matchedZohoIds = new Set<string>();
  for (const inv of orderInvoices) {
    const match = zohoMirrorInvoices.find((z) => {
      if ((inv as any).zoho_invoice_id && z.invoice_id === (inv as any).zoho_invoice_id) return true;
      if (inv.invoice_number && z.invoice_number && z.invoice_number === inv.invoice_number) return true;
      return false;
    });
    if (match) {
      zohoMetaByAttachmentId[inv.id] = match;
      matchedZohoIds.add(match.invoice_id);
    }
  }
  const unattachedZohoInvoices = zohoMirrorInvoices.filter((z) => !matchedZohoIds.has(z.invoice_id));
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
  const [deliveryMode, setDeliveryMode] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [customerGst, setCustomerGst] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [salesPersonId, setSalesPersonId] = useState<string | null>(null);
  const [salesPersonName, setSalesPersonName] = useState<string | null>(null);
  const [editingSalesPerson, setEditingSalesPerson] = useState(false);
  const [savingSalesPerson, setSavingSalesPerson] = useState(false);

  // Live Woo status (only populated for website-sourced orders). Lets us
  // render the WooOrderStatusActions control inside the manual dialog so
  // staff can push status changes back to WooCommerce without leaving
  // this screen.
  // "Woo-linked" — permanent provenance marker. Attribution flips
  // source to 'manual' but external_id stays, so we key on that.
  const isWebsiteOrder = !!(order as any)?.external_id;
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

  // Keep the open dialog in sync with server-side changes to this order
  // (e.g. KYC auto-confirmation flipping confirmation_status while the
  // dialog is open). Scope: only the currently-open order id.
  useEffect(() => {
    if (!open || !order?.id || !onRefresh) return;
    const orderId = order.id;

    const channel = supabase
      .channel(`order-dialog-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => { onRefresh(); },
      )
      .subscribe();

    const onFocus = () => { onRefresh(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') onRefresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [open, order?.id, onRefresh]);

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

  // Snapshot of the last order-derived values we pushed into each form field.
  // Used to detect "untouched" fields when the `order` prop refreshes (e.g.
  // after a payment record is approved and the server recomputes totals):
  // if current state === last-synced value, the user hasn't edited that
  // field since the last sync, so we adopt the fresh order value; otherwise
  // we preserve the user's in-progress edit. Reference equality against the
  // exact instance we set is sufficient (including Date objects for
  // orderDate — the same Date instance is stored in state and snapshot).
  const syncedSnapshotRef = useRef<Record<string, any>>({});
  const prevOrderIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!order) {
      syncedSnapshotRef.current = {};
      prevOrderIdRef.current = null;
      return;
    }
    const firstLoad = prevOrderIdRef.current !== order.id;
    const snap = syncedSnapshotRef.current;
    const sync = <T,>(
      name: string,
      setter: React.Dispatch<React.SetStateAction<T>>,
      newVal: T,
    ) => {
      if (firstLoad || !(name in snap)) {
        setter(newVal);
      } else {
        const last = snap[name];
        setter((cur) => (Object.is(cur, last) ? newVal : cur));
      }
      snap[name] = newVal;
    };

    sync('status', setStatus, order.status);
    sync('paymentStatus', setPaymentStatus, order.payment_status);
    sync('orderType', setOrderType, order.order_type);
    sync('customerType', setCustomerType, order.customer_type);
    sync('shippingAddress', setShippingAddress, order.shipping_address || '');
    sync('supplierName', setSupplierName, order.supplier_name || '');
    sync('supplierContact', setSupplierContact, order.supplier_contact || '');
    sync('procurementRate', setProcurementRate, order.procurement_rate?.toString() || '');
    sync('sellingPrice', setSellingPrice, order.selling_price?.toString() || '');
    sync('totalSalesAmount', setTotalSalesAmount, order.total_sales_amount?.toString() || '');
    sync('discountAmount', setDiscountAmount, order.discount_amount?.toString() || '');
    sync('amountPaid', setAmountPaid, order.amount_paid?.toString() || '');
    sync('paymentTerms', setPaymentTerms, stripHtmlLabel(order.payment_terms) || '');
    sync('trackingNumber', setTrackingNumber, order.tracking_number || '');
    sync('trackingUrl', setTrackingUrl, order.tracking_url || '');
    sync('courierName', setCourierName, (order as any).courier_name || '');
    sync('committedTimeline', setCommittedTimeline, order.committed_timeline || '');
    sync('dispatchedOn', setDispatchedOn, ((order as any).dispatched_on as string) || '');
    sync('internalNotes', setInternalNotes, order.internal_notes || '');
    sync('customerNotes', setCustomerNotes, order.customer_notes || '');
    sync('salesNotes', setSalesNotes, order.sales_notes || '');
    sync('paymentDueDate', setPaymentDueDate, order.payment_due_date || '');
    sync('isRefundRequested', setIsRefundRequested, order.is_refund_requested || false);
    sync('refundReason', setRefundReason, order.refund_reason || '');
    sync('refundStatus', setRefundStatus, (order.refund_status as RefundStatus) || 'pending');
    sync('priority', setPriority, order.priority || 3);
    sync('orderOutcome', setOrderOutcome, (order.order_outcome || 'pending') as OrderOutcome);
    sync('lostReason', setLostReason, (order.lost_reason as LostReason) || 'price');
    sync('lostReasonNotes', setLostReasonNotes, order.lost_reason_notes || '');
    sync('supplierPaymentTerms', setSupplierPaymentTerms, (order as any).supplier_payment_terms || '');
    sync('supplierPaymentDueDate', setSupplierPaymentDueDate, (order as any).supplier_payment_due_date || '');
    sync('isRto', setIsRto, order.is_rto || false);
    sync('cancellationReason', setCancellationReason, order.cancellation_reason || '');
    sync('deliveryMode', setDeliveryMode, ((order as any).delivery_mode as string) || null);
    sync('customerName', setCustomerName, order.customer_name || '');
    sync('customerCompany', setCustomerCompany, order.customer_company || '');
    sync('customerGst', setCustomerGst, (order as any).customer_gst || '');
    sync('customerPhone', setCustomerPhone, (order as any).customer_phone || '');
    sync('customerEmail', setCustomerEmail, (order as any).customer_email || '');
    sync('salesPersonId', setSalesPersonId, order.sales_person_id ?? null);
    sync('salesPersonName', setSalesPersonName, order.sales_person_name ?? null);
    // orderDate: build a new Date each sync and let Object.is preserve
    // reference identity for untouched-detection.
    sync(
      'orderDate',
      setOrderDate,
      order.order_date ? new Date(order.order_date) : new Date(order.created_at),
    );

    if (firstLoad) {
      // Non-diffed fields — always reset on order switch / reopen.
      setInvoiceUrl(order.invoice_url || null);
      setPoUrl(order.po_url || null);
      setPoNumber(order.po_number || '');
      setInvoiceNumber(order.invoice_number || '');
      setInvoiceEmailState(defaultEmailState((order as any).customer_email || ''));
      setEscalationReason('');
      setShowEscalationForm(false);
      setEditingCustomerInfo(false);
      setEditingShipping(false);
      setEditingPayment(false);
      setEditingTracking(false);
      setEditingOrderItems(false);
      setEditedOrderItems({});
      setEditingInvoiceNumber(false);
      fetchOrderItems(order.id).then(setOrderItems);
    }

    prevOrderIdRef.current = order.id;
  }, [order, fetchOrderItems]);

  // Live payment records for this order — MUST be called before any early
  // return to keep hook order stable across renders.
  const { records: livePaymentRecords } = usePaymentRecords(order?.id);

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

  // Pure diff builder — returns ONLY fields whose current form value differs
  // from the persisted order row. This is the single source of truth for both
  // (a) the payload sent to the DB — an empty diff skips the write entirely,
  //     which side-steps the `guard_orders_sensitive_updates` trigger for any
  //     column the user did not actually change (avoids the spurious 42501
  //     salespeople hit after payment auto-recompute), and
  // (b) the "Save Changes" button's isDirty gate.
  const buildOrderUpdatePayload = useCallback((): Partial<Order> => {
    if (!order) return {};
    // Auto-derived status when tracking is added on a non-shipped order.
    let finalStatus = status;
    const trackingWasAdded = trackingNumber && !order.tracking_number;
    const trackingWasUpdated = trackingNumber && order.tracking_number !== trackingNumber;
    if (
      (trackingWasAdded || trackingWasUpdated) &&
      status !== 'in_transit' &&
      status !== 'delivery_done' &&
      status !== 'cancelled'
    ) {
      finalStatus = 'in_transit' as OrderStatus;
    }

    const candidate: Record<string, any> = {
      status: finalStatus,
      payment_status: paymentStatus,
      order_type: orderType,
      customer_type: customerType,
      customer_name: customerName || null,
      customer_company: customerCompany || null,
      customer_gst: customerGst || null,
      customer_phone: customerPhone || null,
      customer_email: customerEmail || null,
      sales_person_id: salesPersonId,
      sales_person_name: salesPersonName,
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
      is_refund_requested: isRefundRequested || finalStatus === 'cancelled',
      priority,
      order_outcome: orderOutcome,
      supplier_payment_terms: supplierPaymentTerms || null,
      supplier_payment_due_date: supplierPaymentDueDate || null,
      order_date: orderDate ? format(orderDate, 'yyyy-MM-dd') : null,
      is_rto: isRto,
      cancellation_reason: finalStatus === 'cancelled' ? cancellationReason : null,
      delivery_mode: deliveryMode,
    };

    const norm = (v: any) => (v === '' || v === undefined ? null : v);

    // Conditional fields — only emit when their driver toggle actually
    // flipped. Otherwise legacy DB values (e.g. refund_status='pending' with
    // is_refund_requested=false, or a stale lost_reason on a 'pending'
    // outcome) would look "changed" against the derived null and get
    // included in the payload, tripping the sales guard trigger with a
    // spurious 42501.
    const refundDriverChanged =
      (isRefundRequested !== !!order.is_refund_requested) ||
      ((finalStatus === 'cancelled') !== (order.status === 'cancelled'));
    if (refundDriverChanged) {
      candidate.refund_reason = isRefundRequested
        ? (refundReason || null)
        : (finalStatus === 'cancelled' ? cancellationReason : null);
      candidate.refund_status =
        (isRefundRequested || finalStatus === 'cancelled') ? refundStatus : null;
    }
    const outcomeChanged = orderOutcome !== (order as any).order_outcome;
    if (outcomeChanged) {
      candidate.lost_reason = orderOutcome === 'lost' ? lostReason : null;
      candidate.lost_reason_notes = orderOutcome === 'lost' ? (lostReasonNotes || null) : null;
    }

    const payload: Record<string, any> = {};
    for (const [k, v] of Object.entries(candidate)) {
      if (norm(v) !== norm((order as any)[k])) payload[k] = v;
    }

    // --- Role-conditional pruning: match guard_orders_sensitive_updates ---
    // Sales (non-privileged) can never hand-edit these; strip so a stale form
    // value never trips a 42501 on Save Changes.
    if (!canEditFinancials) {
      delete payload.selling_price;
      delete payload.amount_paid;
      delete payload.payment_status;
      // total_sales_amount only allowed to move if it mirrors the discount
      // delta (guard verifies math). Drop it unless discount also changed on
      // an OWN order.
      const discountChanged = 'discount_amount' in payload;
      if (!(isOwnOrder && discountChanged)) {
        delete payload.total_sales_amount;
      }
    }
    if (!canEditDiscount) {
      delete payload.discount_amount;
      delete payload.total_sales_amount;
    }

    // Side-effect audit fields — only inject when their primary column is
    // actually changing. These never fake-enable isDirty on their own.
    if ('is_refund_requested' in payload && payload.is_refund_requested && !order.is_refund_requested) {
      payload.refund_requested_at = new Date().toISOString();
      payload.refund_requested_by = user?.id;
    }
    if ('order_outcome' in payload) {
      payload.outcome_updated_at = new Date().toISOString();
      payload.outcome_updated_by = user?.id;
    }
    if ('is_rto' in payload && payload.is_rto && !order.is_rto) {
      payload.rto_marked_at = new Date().toISOString();
      payload.rto_marked_by = user?.id;
    }
    if ('status' in payload && payload.status === 'cancelled' && order.status !== 'cancelled') {
      payload.cancelled_at = new Date().toISOString();
      payload.cancelled_by = user?.id;
    }
    // Website order status manually changed → freeze from Woo mirror overwrite.
    if (!!(order as any).external_id && 'status' in payload && !(order as any).procurement_edited) {
      (payload as any).procurement_edited = true;
    }

    return payload as Partial<Order>;
  }, [
    order,
    status, paymentStatus, orderType, customerType,
    customerName, customerCompany, customerGst, customerPhone, customerEmail,
    salesPersonId, salesPersonName, shippingAddress, supplierName, supplierContact,
    procurementRate, sellingPrice, totalSalesAmount, discountAmount, amountPaid,
    paymentTerms, paymentDueDate, trackingNumber, trackingUrl, courierName,
    committedTimeline, dispatchedOn, internalNotes, customerNotes, salesNotes,
    isRefundRequested, refundReason, refundStatus, priority, orderOutcome,
    lostReason, lostReasonNotes, supplierPaymentTerms, supplierPaymentDueDate,
    orderDate, isRto, cancellationReason, deliveryMode, user?.id,
    canEditFinancials, canEditDiscount, isOwnOrder,
  ]);

  const isDirty = useMemo(
    () => Object.keys(buildOrderUpdatePayload()).length > 0,
    [buildOrderUpdatePayload],
  );

  if (!order) return null;

  // Calculate profit (only visible to admin)
  const profit = order.selling_price && order.procurement_rate
    ? (order.selling_price - order.procurement_rate) * order.quantity
    : null;

  const livePaidAmount = livePaymentRecords
    .filter((r) => r.status === 'approved')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const effectivePaid = Math.max(livePaidAmount, order.amount_paid || 0);
  const balanceAmount = order.total_sales_amount != null
    ? (order.total_sales_amount || 0) - effectivePaid
    : null;

  const handleUpdate = async () => {
    if (!canEditOrder && !canEditSalesFields) return;

    // Validate cancellation reason when status is cancelled
    if (status === 'cancelled' && !cancellationReason.trim()) {
      toast.error('Cancellation reason is required when marking order as cancelled');
      return;
    }

    // Office-pickup delivery requires an approved proof photo before the
    // order can be marked delivered. Mirror the server-side trigger locally
    // so the user gets a clear, immediate message.
    if (status === 'delivery_done') {
      const proofCheck = canMarkDeliveryDone({
        delivery_mode: deliveryMode,
        courier_name: courierName,
        delivery_proof_url: (order as any).delivery_proof_url ?? null,
        delivery_proof_status: (order as any).delivery_proof_status ?? null,
      });
      if (proofCheck.ok === false) {
        toast.error(proofCheck.reason);
        const isOfficeCourier = /(office\s*deliver|office\s*pickup|self\s*deliver|hand\s*deliver|walk[-\s]?in|showroom|^\s*bus\s*$)/i.test(courierName || '');
        if (isOfficeCourier && deliveryMode !== 'office_pickup') {
          setDeliveryMode('office_pickup');
        }
        return;
      }
    }

    // Validate tracking URL is a proper http(s) link
    if (trackingUrl && !isValidHttpUrl(trackingUrl)) {
      toast.error('Tracking URL must be a valid link starting with http:// or https://');
      return;
    }

    const updates = buildOrderUpdatePayload();
    if (Object.keys(updates).length === 0) {
      // No changes — skip the write entirely.
      return;
    }

    setLoading(true);

    const finalStatus = (updates.status as OrderStatus | undefined) ?? status;

    // Edit-history entries — one per diffed field (excluding side-effect audit
    // columns which the trigger owns).
    const AUDIT_ONLY = new Set([
      'refund_requested_at', 'refund_requested_by',
      'outcome_updated_at', 'outcome_updated_by',
      'rto_marked_at', 'rto_marked_by',
      'cancelled_at', 'cancelled_by',
      'procurement_edited',
    ]);
    const changes: Record<string, { old: any; new: any }> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (AUDIT_ONLY.has(k)) continue;
      changes[k] = { old: (order as any)[k], new: v };
    }

    const success = await onUpdate(order.id, updates);

    if (success && Object.keys(changes).length > 0) {
      await recordChanges('orders', order.id, changes, profile?.name || 'Unknown');
    }

    // Mirror tracking changes to the linked WooCommerce order so the
    // website-order tracking card stays in sync.
    if (
      success &&
      !!(order as any).external_id &&
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
    if (!canRefreshPrice) {
      toast.error('You are not permitted to refresh prices from the pricelist.');
      return;
    }
    setRefreshingPrices(true);
    try {
      // Preferred path: SECURITY DEFINER RPC. Uses guard bypass so granted
      // supply-chain users (Sanu Sabu) can refresh even though the direct
      // orders.selling_price / total_sales_amount write is blocked for them.
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        'refresh_order_price_from_pricelist',
        { p_order_id: order.id },
      );
      if (rpcErr) throw rpcErr;
      const res = (rpcData ?? {}) as {
        ok?: boolean; skipped?: string;
        old_selling_price?: number; new_selling_price?: number;
        old_total_sales_amount?: number; new_total_sales_amount?: number;
      };
      if (res.ok) {
        const fmt = (n: number | undefined) =>
          n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`;
        toast.success(
          `Price refreshed: ${fmt(res.old_selling_price)} → ${fmt(res.new_selling_price)} · ` +
          `Total ${fmt(res.old_total_sales_amount)} → ${fmt(res.new_total_sales_amount)}`,
        );
        await onUpdate(order.id, {
          selling_price: res.new_selling_price,
          total_sales_amount: res.new_total_sales_amount,
        } as Partial<Order>);
        return;
      }
      if (res.skipped === 'no_pricelist_match') {
        // Fall through to the legacy per-item path (multi-line orders whose
        // header product_name/product_code don't resolve, but line items do).
      }
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

      // Recalculate the order header total from the refreshed items so the
      // order card (which reads orders.total_sales_amount) reflects the new
      // prices immediately — not just the dialog's Order Items table.
      if (updated > 0) {
        const itemsSubtotal = refreshedItems.reduce(
          (sum, it) => sum + (Number(it.unit_price) || 0) * (Number(it.quantity) || 0),
          0,
        );
        const discount = Number((order as any).discount_amount) || 0;
        const delivery = Number((order as any).delivery_charges) || 0;
        const nextTotal = Math.max(0, itemsSubtotal - discount + delivery);
        const oldTotal = Number((order as any).total_sales_amount) || 0;
        if (nextTotal !== oldTotal) {
          const { error: totalErr } = await supabase
            .from('orders')
            .update({ total_sales_amount: nextTotal })
            .eq('id', order.id);
          if (!totalErr) {
            if (user && profile) {
              await recordChanges('orders', order.id, {
                total_sales_amount: { old: oldTotal, new: nextTotal },
              }, profile.name || 'Unknown');
            }
            await onUpdate(order.id, { total_sales_amount: nextTotal } as Partial<Order>);
          }
        }
      }
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
          if (edits.discount_amount !== (originalItem.discount_amount ?? 0)) {
            const raw = String(edits.discount_amount ?? '').trim();
            const next = raw === '' ? 0 : Number(raw);
            const qty = Number(updates.quantity ?? originalItem.quantity) || 0;
            const price = Number(
              updates.unit_price ?? originalItem.unit_price ?? 0,
            ) || 0;
            const lineGross = qty * price;
            const safe = Number.isFinite(next) && next >= 0 ? next : 0;
            const clamped = lineGross > 0 ? Math.min(safe, lineGross) : safe;
            updates.discount_amount = Math.round(clamped * 100) / 100;
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

      // ---- Handle removed line items ----
      if (order && deletedOrderItemIds.size > 0) {
        for (const removedId of deletedOrderItemIds) {
          const removed = orderItems.find(i => i.id === removedId);
          const { error: delErr } = await supabase.from('order_items').delete().eq('id', removedId);
          if (delErr) throw delErr;
          if (removed && user && profile) {
            await recordChanges('orders', order.id, {
              [`order_item.removed (${removed.product_name})`]: {
                old: { qty: removed.quantity, unit_price: removed.unit_price },
                new: null,
              },
            }, profile.name || 'Unknown');
          }
        }
      }

      // ---- Insert newly-added line items ----
      if (order && newOrderItems.length > 0) {
        const validNew = newOrderItems.filter(n => n.product_name.trim().length > 0);
        if (validNew.length !== newOrderItems.length) {
          toast.error('Every new line item needs a product name.');
          setLoading(false);
          return;
        }
        if (validNew.length > 0) {
          const inserts = validNew.map(n => ({
            order_id: order.id,
            product_name: n.product_name,
            product_category: n.product_category || 'Consumer Drones',
            quantity: Number(n.quantity) || 1,
            unit_price: n.unit_price ? Number(n.unit_price) : null,
            procurement_rate: canSeeProcurement && n.procurement_rate ? Number(n.procurement_rate) : null,
            status: n.status || 'draft',
            notes: n.notes || null,
            supplier_id: n.supplier_id || null,
            discount_amount: (() => {
              const raw = String(n.discount_amount ?? '').trim();
              const parsed = raw === '' ? 0 : Number(raw);
              const safe = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
              const gross = (Number(n.quantity) || 0) * (Number(n.unit_price) || 0);
              const clamped = gross > 0 ? Math.min(safe, gross) : safe;
              return Math.round(clamped * 100) / 100;
            })(),
          }));
          const { error: insErr } = await supabase.from('order_items').insert(inserts);
          if (insErr) throw insErr;
          if (user && profile) {
            const changesRecord: Record<string, { old: any; new: any }> = {};
            validNew.forEach(n => {
              changesRecord[`order_item.added (${n.product_name})`] = {
                old: null,
                new: { qty: n.quantity, unit_price: n.unit_price },
              };
            });
            await recordChanges('orders', order.id, changesRecord, profile.name || 'Unknown');
          }
        }
      }

      // ---- Refresh items and recompute order.total_sales_amount ----
      if (order) {
        const refreshedItems = await fetchOrderItems(order.id);
        setOrderItems(refreshedItems);

        const itemsSubtotal = refreshedItems.reduce(
          (sum, it) => sum + Math.max(0, (Number(it.unit_price) || 0) * (Number(it.quantity) || 0) - (Number(it.discount_amount) || 0)),
          0,
        );
        const discount = Number((order as any).discount_amount) || 0;
        const delivery = Number((order as any).delivery_charges) || 0;
        const nextTotal = Math.max(0, itemsSubtotal - discount + delivery);
        const oldTotal = Number((order as any).total_sales_amount) || 0;
        if (Math.abs(nextTotal - oldTotal) > 0.005) {
          // The DB guard (guard_orders_sensitive_updates) permits non-privileged
          // roles to change total_sales_amount ONLY when the new value equals the
          // recomputed sum of items minus discount plus delivery. Since we compute
          // it exactly that way here, the write will succeed for sales reps too.
          const { error: totalErr } = await supabase
            .from('orders')
            .update({ total_sales_amount: nextTotal })
            .eq('id', order.id);
          if (totalErr) throw totalErr;
          if (user && profile) {
            await recordChanges('orders', order.id, {
              total_sales_amount: { old: oldTotal, new: nextTotal },
            }, profile.name || 'Unknown');
          }
          await onUpdate(order.id, { total_sales_amount: nextTotal } as Partial<Order>);
        }
      }

      toast.success('Order items updated');
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
      setNewOrderItems([]);
      setDeletedOrderItemIds(new Set());
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
            <div className="flex items-center justify-between gap-4">
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
                  {canRefreshPrice && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={refreshPricesFromPricelist}
                      disabled={refreshingPrices || loading}
                      className="ml-auto h-8 gap-1"
                      title="Refresh prices from current pricelist"
                    >
                      {refreshingPrices ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      ↻ Refresh price
                    </Button>
                  )}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2 mt-3 flex-wrap">
                  {order.product_category}
                  <LeadSourceBadge source={order.lead_source || (order as any).source} size="sm" />
                  {(order as any).external_id && (order as any).source !== 'website' && (
                    <NormalizedFromWebsiteBadge
                      attributedAt={(order as any).attributed_at}
                      attributedByName={(order as any).attributed_by_name}
                    />
                  )}
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
                    orderStatus={order.status}
                  />
                  <span className="ml-auto mr-8 inline-flex items-center">
                    <OrderStatusBadge status={order.status} />
                  </span>
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6">
            {/* Weight-gated customer confirmation status */}
            <OrderConfirmationStatusBanner order={order} canResend={isAdmin || isSales} />

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

            {/* Delivery mode + office/showroom proof (staff-only). Customers
                never see this card. */}
            {canEditSalesFields && (
              <DeliveryProofCard
                orderId={order.id}
                orderNumber={order.order_number}
                deliveryMode={deliveryMode}
                onDeliveryModeChange={(m) => setDeliveryMode(m)}
                proofUrl={(order as any).delivery_proof_url ?? null}
                proofStatus={(order as any).delivery_proof_status ?? null}
                proofUploadedAt={(order as any).delivery_proof_uploaded_at ?? null}
                proofReviewedAt={(order as any).delivery_proof_reviewed_at ?? null}
                proofRejectReason={(order as any).delivery_proof_reject_reason ?? null}
                onChanged={() => queryClient.invalidateQueries({ queryKey: ['orders'] })}
              />
            )}

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
              <div id="order-attribution-panel" data-attribution-panel>
                <OrderAttributionPanel internalOrderId={order.id} isMirroredAndPaid />
              </div>
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
                    {phoneErrorInline(customerPhone) && (
                      <p className="text-xs text-destructive">{phoneErrorInline(customerPhone)}</p>
                    )}
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
                    {emailErrorInline(customerEmail) && (
                      <p className="text-xs text-destructive">{emailErrorInline(customerEmail)}</p>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="inline_salesperson">Salesperson</Label>
                      <CompanyOwnerPicker
                        ownerId={salesPersonId}
                        ownerName={salesPersonName}
                        onChange={(userId) => {
                          setSalesPersonId(userId);
                          const selected = salesUsers.find((u) => u.user_id === userId);
                          setSalesPersonName(selected?.name ?? null);
                        }}
                        variant="field"
                        disabled={loading}
                      />
                    </div>
                  )}
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
                      {/*
                        Sales is READ-ONLY in Customer Information for every role.
                        Reassignment MUST go through the Sales attribution panel so
                        the DB triggers stamp attributed_by / attributed_at and
                        write a sales_attribution_log entry. Do NOT reintroduce an
                        inline editor, pencil affordance, or a direct
                        orders update on sales_person_id here — the test
                        src/components/__tests__/OrderDialogSalesReadOnly.test.tsx
                        guards this.
                      */}
                      <span className="font-medium">
                        {salesPersonName || order.sales_person_name || 'Unattributed'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById('order-attribution-panel');
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            const focusable = el.querySelector<HTMLElement>('button, [role="button"], input, select, a');
                            focusable?.focus?.();
                          }
                        }}
                        className="text-xs text-muted-foreground italic hover:text-foreground underline underline-offset-2"
                        title="Sales attribution is managed in the Sales attribution panel"
                      >
                        Change via Sales attribution ↑
                      </button>
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
                  {!editingOrderItems && (
                    <div className="flex items-center gap-2">
                    {canRefreshPrice && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={refreshPricesFromPricelist}
                        disabled={refreshingPrices || loading}
                        className="h-8 gap-1"
                        title="Refresh prices from current pricelist"
                      >
                        {refreshingPrices ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        ↻ Refresh price
                      </Button>
                    )}
                    {canEditOrder && (
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
                            discount_amount: item.discount_amount ?? 0,
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
                    </div>
                  )}
                  {editingOrderItems && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                          setNewOrderItems(prev => [...prev, {
                            id: newId,
                            product_name: '',
                            product_category: 'Consumer Drones',
                            quantity: 1,
                            unit_price: '',
                            status: 'draft',
                            notes: '',
                            procurement_rate: '',
                            supplier_id: '',
                            discount_amount: '',
                          }]);
                        }}
                        className="h-8 gap-1"
                        disabled={loading}
                      >
                        <Plus className="h-4 w-4" />
                        Add Line
                      </Button>
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
                          setNewOrderItems([]);
                          setDeletedOrderItemIds(new Set());
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
                      <TableHead className="text-right">Discount</TableHead>
                      {canSeeProcurement && <TableHead className="text-right">Procurement</TableHead>}
                      <TableHead className="text-right">Total</TableHead>
                      {editingOrderItems && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderItems.filter(i => !deletedOrderItemIds.has(i.id)).map((item) => (
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
                        <TableCell className="text-right">
                          {editingOrderItems ? (
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              max={
                                (parseFloat(editedOrderItems[item.id]?.unit_price) || 0) *
                                (parseInt(editedOrderItems[item.id]?.quantity) || 0) || undefined
                              }
                              value={editedOrderItems[item.id]?.discount_amount ?? ''}
                              onChange={(e) => setEditedOrderItems(prev => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], discount_amount: e.target.value }
                              }))}
                              className="h-8 w-24 text-right text-sm"
                              placeholder="₹0"
                            />
                          ) : (
                            item.discount_amount && Number(item.discount_amount) > 0
                              ? `-₹${Number(item.discount_amount).toLocaleString('en-IN')}`
                              : '-'
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
                                ? `₹${Math.max(0, parseFloat(editedOrderItems[item.id].unit_price) * parseInt(editedOrderItems[item.id].quantity) - (parseFloat(editedOrderItems[item.id].discount_amount) || 0)).toLocaleString('en-IN')}`
                                : '-'}
                            </span>
                          ) : (
                            item.unit_price ? `₹${Math.max(0, item.unit_price * item.quantity - (Number(item.discount_amount) || 0)).toLocaleString('en-IN')}` : '-'
                          )}
                        </TableCell>
                        {editingOrderItems && (
                          <TableCell className="w-10">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeletedOrderItemIds(prev => {
                                const next = new Set(prev);
                                next.add(item.id);
                                return next;
                              })}
                              disabled={loading}
                              title="Remove this line item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {editingOrderItems && newOrderItems.map((item, idx) => (
                      <TableRow key={item.id} className="bg-primary/5">
                        <TableCell>
                          <div className="space-y-1">
                            <ProductSelect
                              value={item.product_name}
                              onChange={(name, product?: PricelistItem) => {
                                setNewOrderItems(prev => prev.map((p, i) => i === idx ? {
                                  ...p,
                                  product_name: name,
                                  ...(product ? {
                                    unit_price: String(product.dealer_price || product.website_price || p.unit_price || ''),
                                    product_category: product.product_category || p.product_category,
                                  } : {}),
                                } : p));
                              }}
                              placeholder="Select or type product..."
                              className="h-8 text-sm"
                            />
                            <Input
                              value={item.notes}
                              onChange={(e) => setNewOrderItems(prev => prev.map((p, i) => i === idx ? { ...p, notes: e.target.value } : p))}
                              className="h-7 text-xs"
                              placeholder="Notes (optional)"
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={item.status}
                            onValueChange={(v) => setNewOrderItems(prev => prev.map((p, i) => i === idx ? { ...p, status: v } : p))}
                          >
                            <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ORDER_ITEM_STATUSES.map(s => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={item.supplier_id || 'none'}
                            onValueChange={(v) => setNewOrderItems(prev => prev.map((p, i) => i === idx ? { ...p, supplier_id: v === 'none' ? '' : v } : p))}
                          >
                            <SelectTrigger className="h-8 w-[160px] text-sm"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Supplier</SelectItem>
                              {suppliers.map(s => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name} {s.brand_name ? `(${s.brand_name})` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => setNewOrderItems(prev => prev.map((p, i) => i === idx ? { ...p, quantity: Math.max(1, Number(e.target.value) || 1) } : p))}
                            className="h-8 w-20 text-right text-sm"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.unit_price}
                            onChange={(e) => setNewOrderItems(prev => prev.map((p, i) => i === idx ? { ...p, unit_price: e.target.value } : p))}
                            className="h-8 w-24 text-right text-sm"
                            placeholder="₹0"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            max={
                              (parseFloat(item.unit_price) || 0) * (Number(item.quantity) || 0) || undefined
                            }
                            value={item.discount_amount}
                            onChange={(e) => setNewOrderItems(prev => prev.map((p, i) => i === idx ? { ...p, discount_amount: e.target.value } : p))}
                            className="h-8 w-24 text-right text-sm"
                            placeholder="₹0"
                          />
                        </TableCell>
                        {canSeeProcurement && (
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.procurement_rate}
                              onChange={(e) => setNewOrderItems(prev => prev.map((p, i) => i === idx ? { ...p, procurement_rate: e.target.value } : p))}
                              className="h-8 w-24 text-right text-sm"
                              placeholder="₹0"
                            />
                          </TableCell>
                        )}
                        <TableCell className="text-right font-medium">
                          <span className="text-sm">
                            {item.unit_price && item.quantity
                              ? `₹${Math.max(0, parseFloat(item.unit_price) * item.quantity - (parseFloat(item.discount_amount) || 0)).toLocaleString('en-IN')}`
                              : '-'}
                          </span>
                        </TableCell>
                        <TableCell className="w-10">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setNewOrderItems(prev => prev.filter((_, i) => i !== idx))}
                            disabled={loading}
                            title="Discard this new line"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
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
                      disabled={loading || !canEditFinancials}
                      readOnly={!canEditFinancials}
                    />
                    {!canEditFinancials && (
                      <p className="text-xs text-muted-foreground">
                        Apply a discount below, or ask a manager for a price change.
                      </p>
                    )}
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
                      disabled={loading || !canEditDiscount}
                      readOnly={!canEditDiscount}
                      placeholder="0"
                    />
                    {canEditDiscount && (() => {
                      const gross = (parseFloat(totalSalesAmount) || order.total_sales_amount || 0)
                        + (parseFloat(discountAmount) || 0)
                        - (Number(order.discount_amount) || 0);
                      const disc = parseFloat(discountAmount) || 0;
                      const finalTotal = Math.max(0, gross - disc);
                      const invalid = disc < 0 || (gross > 0 && disc >= gross);
                      return (
                        <p className={`text-xs ${invalid ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {invalid
                            ? 'Discount must be ≥ 0 and less than the gross total.'
                            : `Final total after discount: ₹${finalTotal.toLocaleString('en-IN')}`}
                        </p>
                      );
                    })()}
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
                      disabled={loading || !canEditFinancials}
                      readOnly={!canEditFinancials}
                    />
                    {!canEditFinancials && (
                      <p className="text-xs text-muted-foreground">
                        Derived from payment records — add a payment below.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inline_payment_status">Payment Status</Label>
                    <Select
                      value={paymentStatus}
                      onValueChange={(v) => setPaymentStatus(v as PaymentStatus)}
                      disabled={!canEditFinancials}
                    >
                      <SelectTrigger disabled={!canEditFinancials}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_STATUSES.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!canEditFinancials && (
                      <p className="text-xs text-muted-foreground">
                        Derived from payment records — add a payment below.
                      </p>
                    )}
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
                     const itemDiscountTotal = (orderItems ?? []).reduce(
                       (s, it) => s + (Number(it?.discount_amount) || 0),
                       0,
                     );
                    const hasOrderDiscount = currentDiscount > 0;
                    const hasItemDiscount = itemDiscountTotal > 0;
                    const hasDiscount = hasOrderDiscount || hasItemDiscount;
                    // currentTotal already reflects item discounts (net of them);
                    // gross subtotal = currentTotal + order-level discount + item discounts.
                    const subtotal = currentTotal + currentDiscount + itemDiscountTotal;
                    return (
                      <>
                        {hasDiscount && (
                          <div>
                            <span className="text-muted-foreground">Subtotal:</span>
                            <p className="font-medium">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          </div>
                        )}
                        {hasItemDiscount && (
                          <div>
                            <span className="text-muted-foreground">Item Discounts:</span>
                            <p className="font-medium text-purple-600">-₹{itemDiscountTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          </div>
                        )}
                        {hasOrderDiscount && (
                          <div>
                            <span className="text-muted-foreground">Order Discount:</span>
                            <p className="font-medium text-purple-600">-₹{currentDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-muted-foreground">{hasDiscount ? 'Net Amount:' : 'Total Amount:'}</span>
                          <p className="font-medium">₹{currentTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                      </>
                    );
                  })()}
                  <div>
                    <span className="text-muted-foreground">Paid:</span>
                    <p className="font-medium text-green-600">₹{(parseFloat(amountPaid) || effectivePaid || 0).toLocaleString('en-IN')}</p>
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
                       <p className="font-medium">{stripHtmlLabel(paymentTerms || order.payment_terms)}</p>
                     </div>
                   )}
                </div>
              )}

              {/* Payment Records */}
              <div className="pt-3 border-t border-border">
                <div className="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
                  <h5 className="text-sm font-medium">Payment Records</h5>
                  <p className="text-[11px] text-muted-foreground">
                    Split payments supported — click <span className="font-medium">Upload Payment</span> once per mode
                    (e.g. ₹10,000 cash + ₹40,000 UPI). Amount Paid recomputes across all approved records.
                  </p>
                </div>
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
                  zohoMetaByInvoiceId={zohoMetaByAttachmentId}
                />
              )}

              {/* Zoho Books mirror invoices that are NOT yet attached to this order.
                  Attached mirrors are merged inline into the InvoiceListCard rows above. */}
              <ZohoInvoiceCard
                orderNumber={order?.order_number}
                orderId={order?.id ?? null}
                invoices={unattachedZohoInvoices}
                loading={zohoMirrorLoading}
                onAttached={() => refetchInvoices()}
              />

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

                {/* Financial fields — hand-editable only by admin / sales_manager. */}
                {canEditFinancials && (
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

                {/* Sales own-order discount lever (when full financial edit is denied). */}
                {!canEditFinancials && canEditDiscount && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="sales_discount_amount">Discount (₹)</Label>
                      <Input
                        id="sales_discount_amount"
                        type="number"
                        min={0}
                        step={0.01}
                        value={discountAmount}
                        onChange={e => setDiscountAmount(e.target.value)}
                        disabled={loading}
                        placeholder="0"
                      />
                      {(() => {
                        const gross = (parseFloat(totalSalesAmount) || order.total_sales_amount || 0)
                          + (parseFloat(discountAmount) || 0)
                          - (Number(order.discount_amount) || 0);
                        const disc = parseFloat(discountAmount) || 0;
                        const finalTotal = Math.max(0, gross - disc);
                        const invalid = disc < 0 || (gross > 0 && disc >= gross);
                        return (
                          <p className={`text-xs ${invalid ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {invalid
                              ? 'Discount must be ≥ 0 and less than the gross total.'
                              : `Final total after discount: ₹${finalTotal.toLocaleString('en-IN')}`}
                          </p>
                        );
                      })()}
                    </div>
                  </div>
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
                <Button
                  onClick={handleUpdate}
                  disabled={loading || !isDirty}
                  title={!isDirty ? 'No changes to save' : undefined}
                >
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
            <p className="text-xs text-muted-foreground">
              {order?.external_id
                ? 'The customer will be added back to Leads as a "Deleted website order" so sales can re-engage them.'
                : 'The originating enquiry / pipeline / email lead will be marked lost with this reason. If there is no linked source, the customer will be added back to Leads as a "Deleted order".'}
            </p>
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
