import { useState, useEffect, useRef } from "react";
import { Order } from "@/hooks/useOrders";
import { Supplier, useSupplierPayments } from "@/hooks/useSuppliers";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEditHistory } from "@/hooks/useEditHistory";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { PAYMENT_MODES } from "@/lib/paymentModes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileText, Building2, CreditCard, Loader2, Plus, Trash2, Package, Image, X, CalendarIcon, ClipboardList, Pencil, Check } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ProcurementOrderItems } from "./ProcurementOrderItems";
import { OrderNumberBadge } from "@/components/OrderNumberBadge";
import { calculatePaymentDueDate } from "@/lib/paymentTerms";
import { EditHistoryPanel } from "@/components/EditHistoryPanel";
import { ProcurementPlanningDialog } from "./ProcurementPlanningDialog";
import { SupplierPreferenceTag } from "./SupplierPreferenceTag";

interface ProcurementOrderDialogProps {
  order: Order | null;
  suppliers: Supplier[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, updates: Partial<Order>) => Promise<boolean>;
}

export function ProcurementOrderDialog({
  order,
  suppliers,
  open,
  onOpenChange,
  onUpdate,
}: ProcurementOrderDialogProps) {
  const { user, role, profile } = useAuth();
  const { recordChanges } = useEditHistory();
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [procurementRate, setProcurementRate] = useState<string>("");
  const [procurementCurrency, setProcurementCurrency] = useState<string>("INR");
  const [procurementDate, setProcurementDate] = useState<Date | undefined>(undefined);
  const [supplierPaymentStatus, setSupplierPaymentStatus] = useState<string>("pending");
  const [internalNotes, setInternalNotes] = useState<string>("");
  const [additionalDetails, setAdditionalDetails] = useState<string>("");
  const [poFile, setPoFile] = useState<File | null>(null);
  const [poNumber, setPoNumber] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPlanningDialog, setShowPlanningDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerName, setCustomerName] = useState<string>("");
  const [customerCompany, setCustomerCompany] = useState<string>("");

  const canEdit = role === 'supply_chain' || role === 'admin' || role === 'finance';

  // Payment to supplier form
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<string>("bank_transfer");
  const [paymentNotes, setPaymentNotes] = useState<string>("");
  const [paymentReferenceNumber, setPaymentReferenceNumber] = useState<string>("");
  const [paymentScreenshots, setPaymentScreenshots] = useState<File[]>([]);
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [paymentLoading, setPaymentLoading] = useState(false);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  const { payments, createPayment, deletePayment, loading: paymentsLoading } = useSupplierPayments(selectedSupplierId || undefined);

  // Filter payments for this order
  const orderPayments = payments.filter(p => p.order_id === order?.id);

  useEffect(() => {
    if (order) {
      // First check supplier_id, then fallback to finding by name
      const supplierId = (order as any).supplier_id;
      if (supplierId) {
        setSelectedSupplierId(supplierId);
      } else {
        const supplier = suppliers.find(s => s.name === order.supplier_name);
        setSelectedSupplierId(supplier?.id || "");
      }
      setProcurementRate(order.procurement_rate?.toString() || "");
      setProcurementCurrency(order.procurement_currency || "INR");
      setProcurementDate(order.procurement_date ? parseISO(order.procurement_date) : undefined);
      setInternalNotes(order.internal_notes || "");
      setAdditionalDetails((order as any).additional_details || "");
      setPoNumber((order as any).po_number || "");
      setCustomerName(order.customer_name || "");
      setCustomerCompany(order.customer_company || "");
      setEditingCustomer(false);
    }
  }, [order, suppliers]);

  const handleSupplierChange = (supplierId: string) => {
    setSelectedSupplierId(supplierId);
    const supplier = suppliers.find(s => s.id === supplierId);
    if (supplier) {
      // Auto-fill supplier details
    }
  };

  const handleSaveCustomer = async () => {
    if (!order || !canEdit) return;

    try {
      setSaving(true);
      
      const updates = {
        customer_name: customerName.trim() || null,
        customer_company: customerCompany.trim() || null,
      };

      // Track changes
      const changes: Record<string, { old: any; new: any }> = {};
      if (order.customer_name !== updates.customer_name) {
        changes.customer_name = { old: order.customer_name, new: updates.customer_name };
      }
      if (order.customer_company !== updates.customer_company) {
        changes.customer_company = { old: order.customer_company, new: updates.customer_company };
      }

      // Lock manually-edited fields on website orders so the WooCommerce
      // mirror does not overwrite them on the next webhook / backfill.
      const isWebsite = !!(order as any).external_id;
      const existingOverrides: string[] = Array.isArray((order as any).manual_overrides)
        ? (order as any).manual_overrides
        : [];
      const merged = isWebsite
        ? Array.from(new Set([...existingOverrides, ...Object.keys(changes)]))
        : existingOverrides;

      const persisted: Record<string, any> = { ...updates };
      if (isWebsite && merged.length !== existingOverrides.length) {
        persisted.manual_overrides = merged;
      }

      const ok = await onUpdate(order.id, persisted as Partial<Order>);
      if (!ok) throw new Error('Update failed');

      if (Object.keys(changes).length > 0) {
        await recordChanges('orders', order.id, changes, profile?.name || 'Unknown');
      }

      toast.success('Customer details updated');
      setEditingCustomer(false);
    } catch (error: any) {
      console.error('Error updating customer:', error);
      toast.error(error.message || 'Failed to update customer');
    } finally {
      setSaving(false);
    }
  };
  const handleUploadPO = async () => {
    if (!poFile || !order || !user) return;

    try {
      setUploading(true);
      const { validateFile } = await import('@/lib/fileValidation');
      const validation = validateFile(poFile, 'documents');
      if (!validation.valid) { toast.error(validation.error); setUploading(false); return; }
      const fileExt = poFile.name.split('.').pop();
      const fileName = `${order.id}-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('purchase-orders')
        .upload(filePath, poFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('purchase-orders')
        .getPublicUrl(filePath);

      await onUpdate(order.id, { po_url: publicUrl } as any);
      toast.success('PO uploaded successfully');
      setPoFile(null);
    } catch (error: any) {
      console.error('Error uploading PO:', error);
      toast.error(error.message || 'Failed to upload PO');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!order || !canEdit) return;

    try {
      setSaving(true);
      const supplier = suppliers.find(s => s.id === selectedSupplierId);
      
      const updates: Record<string, any> = {
        supplier_name: supplier?.name || null,
        supplier_contact: supplier?.phone || null,
        procurement_rate: procurementRate ? parseFloat(procurementRate) : null,
        estimated_procurement_rate: procurementRate ? parseFloat(procurementRate) : (order as any).estimated_procurement_rate ?? null,
        procurement_currency: procurementCurrency,
        procurement_date: procurementDate ? format(procurementDate, 'yyyy-MM-dd') : null,
        internal_notes: internalNotes || null,
        additional_details: additionalDetails || null,
        po_number: poNumber || null,
      };

      // Track changes for edit history
      const changes: Record<string, { old: any; new: any }> = {};
      
      if (order.supplier_name !== (supplier?.name || null)) {
        changes.supplier_name = { old: order.supplier_name, new: supplier?.name || null };
      }
      if (order.procurement_rate !== (procurementRate ? parseFloat(procurementRate) : null)) {
        changes.procurement_rate = { old: order.procurement_rate, new: procurementRate ? parseFloat(procurementRate) : null };
      }
      if (order.procurement_currency !== procurementCurrency) {
        changes.procurement_currency = { old: order.procurement_currency, new: procurementCurrency };
      }
      const newProcDate = procurementDate ? format(procurementDate, 'yyyy-MM-dd') : null;
      if (order.procurement_date !== newProcDate) {
        changes.procurement_date = { old: order.procurement_date, new: newProcDate };
      }
      if (order.internal_notes !== (internalNotes || null)) {
        changes.internal_notes = { old: order.internal_notes, new: internalNotes || null };
      }
      if ((order as any).additional_details !== (additionalDetails || null)) {
        changes.additional_details = { old: (order as any).additional_details, new: additionalDetails || null };
      }
      if ((order as any).po_number !== (poNumber || null)) {
        changes.po_number = { old: (order as any).po_number, new: poNumber || null };
      }

      // Lock manually-edited fields on website orders so the WooCommerce
      // mirror does not silently revert them on the next webhook / backfill.
      const isWebsite = !!(order as any).external_id;
      const existingOverrides: string[] = Array.isArray((order as any).manual_overrides)
        ? (order as any).manual_overrides
        : [];
      const editedFieldKeys = Object.keys(changes);
      const merged = isWebsite
        ? Array.from(new Set([...existingOverrides, ...editedFieldKeys]))
        : existingOverrides;

      const persisted: Record<string, any> = {
        ...updates,
        supplier_id: selectedSupplierId || null,
      };
      if (isWebsite && merged.length !== existingOverrides.length) {
        persisted.manual_overrides = merged;
      }
      // Mark order as procurement-edited so the Woo mirror stops
      // overwriting status/supplier/procurement fields on subsequent syncs.
      if (!(order as any).procurement_edited) {
        persisted.procurement_edited = true;
      }

      // Route through useOrders.updateOrder so the React Query cache gets
      // an optimistic update + invalidation. The previous direct
      // supabase.update bypassed the cache and relied on realtime races.
      const ok = await onUpdate(order.id, persisted as Partial<Order>);
      if (!ok) throw new Error('Update failed');

      // Record edit history
      if (Object.keys(changes).length > 0) {
        await recordChanges('orders', order.id, changes, profile?.name || 'Unknown');
      }

      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating order:', error);
      toast.error(error.message || 'Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPayment = async () => {
    if (!selectedSupplierId || !paymentAmount || !order) {
      toast.error('Please fill in all payment details');
      return;
    }

    setPaymentLoading(true);
    const success = await createPayment({
      supplier_id: selectedSupplierId,
      order_id: order.id,
      inventory_procurement_id: null,
      amount: parseFloat(paymentAmount),
      payment_type: 'payment',
      payment_mode: paymentMode,
      payment_date: format(paymentDate, 'yyyy-MM-dd'),
      notes: paymentNotes || null,
      reference_number: paymentReferenceNumber || null,
    }, paymentScreenshots.length > 0 ? paymentScreenshots : undefined);

    setPaymentLoading(false);
    if (success) {
      setPaymentAmount("");
      setPaymentNotes("");
      setPaymentReferenceNumber("");
      setPaymentScreenshots([]);
      setPaymentDate(new Date());
      setShowAddPayment(false);
      setShowAddPayment(false);
    }
  };

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setPaymentScreenshots(prev => [...prev, ...newFiles]);
    }
    if (screenshotInputRef.current) {
      screenshotInputRef.current.value = '';
    }
  };

  const handleRemoveScreenshot = (index: number) => {
    setPaymentScreenshots(prev => prev.filter((_, i) => i !== index));
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (confirm('Are you sure you want to delete this payment?')) {
      await deletePayment(paymentId);
    }
  };

  if (!order) return null;

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);
  const totalPaidToSupplier = orderPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalProcurementValue = (parseFloat(procurementRate) || 0) * order.quantity;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <FileText className="w-5 h-5" />
            Manage Procurement
            <OrderNumberBadge orderNumber={order.order_number} size="md" />
            <span className="text-muted-foreground">-</span>
            {order.product_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Order Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-muted-foreground">Customer</p>
                  {canEdit && !editingCustomer && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-5 w-5"
                      onClick={() => setEditingCustomer(true)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {editingCustomer ? (
                  <div className="space-y-2">
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer name"
                      className="h-7 text-sm"
                    />
                    <Input
                      value={customerCompany}
                      onChange={(e) => setCustomerCompany(e.target.value)}
                      placeholder="Company name"
                      className="h-7 text-sm"
                    />
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        className="h-6 text-xs"
                        onClick={handleSaveCustomer}
                        disabled={saving}
                      >
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                        Save
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 text-xs"
                        onClick={() => {
                          setEditingCustomer(false);
                          setCustomerName(order.customer_name || '');
                          setCustomerCompany(order.customer_company || '');
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="font-medium">{order.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{order.customer_company}</p>
                  </>
                )}
              </div>
              <div>
                <p className="text-muted-foreground">Product</p>
                <p className="font-medium">{order.product_name}</p>
                <p className="text-xs text-muted-foreground">Qty: {order.quantity}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Sales Amount</p>
                <p className="font-medium">₹{order.total_sales_amount?.toLocaleString() || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <Badge variant="outline">{order.status.replace('_', ' ')}</Badge>
              </div>
            </CardContent>
          </Card>


          {/* Order Items with Procurement Rates */}
          <ProcurementOrderItems
            orderId={order.id}
            orderQuantity={order.quantity}
            orderProcurementRate={order.procurement_rate || undefined}
            procurementCurrency={procurementCurrency}
            suppliers={suppliers}
            orderSupplierId={(order as any).supplier_id || null}
            onSupplierChange={(supplierId) => {
              if (!selectedSupplierId) {
                setSelectedSupplierId(supplierId);
              }
            }}
            orderProductData={{
              product_name: order.product_name,
              product_category: order.product_category || undefined,
              product_code: order.product_code || undefined,
              quantity: order.quantity,
              unit_price: order.selling_price || undefined,
            }}
          />

          <Separator />

          {/* PO Upload */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              <h3 className="font-medium">Purchase Order</h3>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-sm text-muted-foreground mb-1.5 block">PO Number</Label>
                <Input
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="Enter purchase order number..."
                  disabled={!canEdit}
                  maxLength={50}
                />
              </div>

              <div>
                <Label className="text-sm text-muted-foreground mb-1.5 block">Upload PO Document</Label>
                <div className="flex items-center gap-4">
                  <Input
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    onChange={(e) => setPoFile(e.target.files?.[0] || null)}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleUploadPO} 
                    disabled={!poFile || uploading}
                    size="sm"
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Upload'
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {(order as any).po_url && (
              <a 
                href={(order as any).po_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                <FileText className="w-4 h-4" />
                View current PO
              </a>
            )}
          </div>

          <Separator />

          {/* Payment to Supplier */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                <h3 className="font-medium">Payments to Supplier</h3>
              </div>
              {selectedSupplierId && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowAddPayment(!showAddPayment)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Payment
                </Button>
              )}
            </div>

            {!selectedSupplierId ? (
              <div className="p-4 bg-muted/50 rounded-lg text-center text-sm text-muted-foreground">
                Select a supplier in the Order Items section above to manage payments
              </div>
            ) : (
              <>

              {/* Payment Summary */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Total Value</p>
                  <p className="font-medium">₹{totalProcurementValue.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="font-medium text-green-600">₹{totalPaidToSupplier.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pending</p>
                  <p className="font-medium text-red-600">
                    ₹{(totalProcurementValue - totalPaidToSupplier).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Add Payment Form */}
              {showAddPayment && (
                <Card>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Amount</Label>
                        <Input
                          type="number"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Mode</Label>
                        <Select value={paymentMode} onValueChange={setPaymentMode}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_MODES.map((m) => (
                              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Payment Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !paymentDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {paymentDate ? format(paymentDate, "dd MMM yyyy") : <span>Pick a date</span>}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={paymentDate}
                              onSelect={(date) => date && setPaymentDate(date)}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Reference Number</Label>
                      <Input
                        value={paymentReferenceNumber}
                        onChange={(e) => setPaymentReferenceNumber(e.target.value)}
                        placeholder="Transaction ID, UTR, Cheque No., etc."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        placeholder="Payment notes..."
                        rows={2}
                      />
                    </div>
                    
                    {/* Screenshot Upload */}
                    <div className="space-y-2">
                      <Label>Payment Screenshots</Label>
                      <input
                        ref={screenshotInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleScreenshotChange}
                        className="hidden"
                      />
                      {paymentScreenshots.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {paymentScreenshots.map((file, index) => (
                            <div key={index} className="relative group">
                              <img 
                                src={URL.createObjectURL(file)} 
                                alt={`Screenshot ${index + 1}`}
                                className="w-16 h-16 object-cover rounded border"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveScreenshot(index)}
                                className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => screenshotInputRef.current?.click()}
                        className="w-full"
                      >
                        <Image className="h-4 w-4 mr-2" />
                        {paymentScreenshots.length > 0 ? 'Add More Screenshots' : 'Upload Screenshots'}
                      </Button>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={handleAddPayment} size="sm" disabled={paymentLoading}>
                        {paymentLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Recording...
                          </>
                        ) : (
                          'Record Payment'
                        )}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {
                        setShowAddPayment(false);
                        setPaymentScreenshots([]);
                      }}>
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Payment History */}
              {orderPayments.length > 0 && (
                <div className="space-y-2">
                  {orderPayments.map(payment => (
                    <div 
                      key={payment.id} 
                      className="p-3 bg-muted/30 rounded-lg space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">₹{payment.amount.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(payment.payment_date), 'dd MMM yyyy')} • {payment.payment_mode}
                            {payment.reference_number && ` • Ref: ${payment.reference_number}`}
                          </p>
                          {payment.notes && (
                            <p className="text-xs text-muted-foreground mt-1">{payment.notes}</p>
                          )}
                        </div>
                        {role === 'admin' && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDeletePayment(payment.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                      {/* Payment Screenshots */}
                      {payment.screenshot_urls && payment.screenshot_urls.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
                          {payment.screenshot_urls.map((url, index) => (
                            <a
                              key={index}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block"
                            >
                              <img
                                src={url}
                                alt={`Payment screenshot ${index + 1}`}
                                className="w-16 h-16 object-cover rounded border hover:opacity-80 transition-opacity cursor-pointer"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          </div>

          <Separator />

          {/* Internal Notes */}
          <div className="space-y-2">
            <Label>Internal Notes</Label>
            <Textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Internal notes about this procurement..."
              rows={3}
              disabled={!canEdit}
            />
          </div>

          {/* Additional Details */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Additional Details
            </Label>
            <Textarea
              value={additionalDetails}
              onChange={(e) => setAdditionalDetails(e.target.value.slice(0, 1000))}
              placeholder="Add any additional instructions, supplier notes, delivery info..."
              rows={3}
              maxLength={1000}
              disabled={!canEdit}
            />
            <p className="text-xs text-muted-foreground text-right">{additionalDetails.length}/1000</p>
          </div>

          {/* Edit History */}
          {order && (
            <EditHistoryPanel tableName="orders" recordId={order.id} />
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {canEdit ? 'Cancel' : 'Close'}
            </Button>
            {canEdit && (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Procurement Planning Dialog */}
      {order && (
        <ProcurementPlanningDialog
          open={showPlanningDialog}
          onOpenChange={setShowPlanningDialog}
          order={{
            id: order.id,
            order_number: order.order_number,
            product_name: order.product_name,
            product_category: order.product_category,
            quantity: order.quantity,
            customer_company: order.customer_company,
          }}
          onSupplierSelected={(supplierId, quotation) => {
            setSelectedSupplierId(supplierId);
            setProcurementRate(quotation.unit_price.toString());
            setShowPlanningDialog(false);
          }}
        />
      )}
    </Dialog>
  );
}
