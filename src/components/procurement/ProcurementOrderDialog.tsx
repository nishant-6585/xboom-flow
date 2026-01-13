import { useState, useEffect } from "react";
import { Order } from "@/hooks/useOrders";
import { Supplier, useSupplierPayments } from "@/hooks/useSuppliers";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileText, Building2, CreditCard, Loader2, Plus, Trash2, Package, Image, X } from "lucide-react";
import { format } from "date-fns";
import { ProcurementOrderItems } from "./ProcurementOrderItems";
import { OrderNumberBadge } from "@/components/OrderNumberBadge";
import { useRef } from "react";

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
  const { user, role } = useAuth();
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [procurementRate, setProcurementRate] = useState<string>("");
  const [procurementCurrency, setProcurementCurrency] = useState<string>("INR");
  const [supplierPaymentStatus, setSupplierPaymentStatus] = useState<string>("pending");
  const [internalNotes, setInternalNotes] = useState<string>("");
  const [poFile, setPoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Payment to supplier form
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<string>("bank_transfer");
  const [paymentNotes, setPaymentNotes] = useState<string>("");
  const [paymentScreenshots, setPaymentScreenshots] = useState<File[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  const { payments, createPayment, deletePayment, loading: paymentsLoading } = useSupplierPayments(selectedSupplierId || undefined);

  // Filter payments for this order
  const orderPayments = payments.filter(p => p.order_id === order?.id);

  useEffect(() => {
    if (order) {
      // Find supplier by name
      const supplier = suppliers.find(s => s.name === order.supplier_name);
      setSelectedSupplierId(supplier?.id || "");
      setProcurementRate(order.procurement_rate?.toString() || "");
      setProcurementCurrency(order.procurement_currency || "INR");
      setInternalNotes(order.internal_notes || "");
    }
  }, [order, suppliers]);

  const handleSupplierChange = (supplierId: string) => {
    setSelectedSupplierId(supplierId);
    const supplier = suppliers.find(s => s.id === supplierId);
    if (supplier) {
      // Auto-fill supplier details
    }
  };

  const handleUploadPO = async () => {
    if (!poFile || !order || !user) return;

    try {
      setUploading(true);
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
    if (!order) return;

    try {
      setSaving(true);
      const supplier = suppliers.find(s => s.id === selectedSupplierId);
      
      const updates: Partial<Order> = {
        supplier_name: supplier?.name || null,
        supplier_contact: supplier?.phone || null,
        procurement_rate: procurementRate ? parseFloat(procurementRate) : null,
        procurement_currency: procurementCurrency,
        internal_notes: internalNotes || null,
      };

      // Also update supplier_id
      const { error } = await supabase
        .from('orders')
        .update({
          ...updates,
          supplier_id: selectedSupplierId || null,
        })
        .eq('id', order.id);

      if (error) throw error;

      toast.success('Order updated successfully');
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
      amount: parseFloat(paymentAmount),
      payment_type: 'payment',
      payment_mode: paymentMode,
      payment_date: new Date().toISOString().split('T')[0],
      notes: paymentNotes || null,
      reference_number: null,
    }, paymentScreenshots.length > 0 ? paymentScreenshots : undefined);

    setPaymentLoading(false);
    if (success) {
      setPaymentAmount("");
      setPaymentNotes("");
      setPaymentScreenshots([]);
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
                <p className="text-muted-foreground">Customer</p>
                <p className="font-medium">{order.customer_name}</p>
                <p className="text-xs text-muted-foreground">{order.customer_company}</p>
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
          />

          <Separator />

          {/* Supplier Selection */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              <h3 className="font-medium">Supplier Details</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Select Supplier</Label>
                <Select value={selectedSupplierId} onValueChange={handleSupplierChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(supplier => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name} {supplier.brand_name ? `(${supplier.brand_name})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedSupplier && (
                <div className="p-3 bg-muted/50 rounded-lg text-sm">
                  <p className="font-medium">{selectedSupplier.name}</p>
                  <p className="text-muted-foreground">{selectedSupplier.contact_name}</p>
                  <p className="text-muted-foreground">{selectedSupplier.phone}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Procurement Rate (per unit)</Label>
                <Input
                  type="number"
                  value={procurementRate}
                  onChange={(e) => setProcurementRate(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={procurementCurrency} onValueChange={setProcurementCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR (₹)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Total Procurement Value</Label>
                <div className="p-2 bg-muted rounded-md font-medium">
                  {procurementCurrency === 'USD' ? '$' : '₹'}
                  {totalProcurementValue.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* PO Upload */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              <h3 className="font-medium">Purchase Order</h3>
            </div>

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
          {selectedSupplierId && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  <h3 className="font-medium">Payments to Supplier</h3>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowAddPayment(!showAddPayment)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Payment
                </Button>
              </div>

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
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                            <SelectItem value="upi">UPI</SelectItem>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="cheque">Cheque</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
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
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                    >
                      <div>
                        <p className="font-medium">₹{payment.amount.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(payment.payment_date), 'dd MMM yyyy')} • {payment.payment_mode}
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
                  ))}
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Internal Notes */}
          <div className="space-y-2">
            <Label>Internal Notes</Label>
            <Textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Internal notes about this procurement..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
