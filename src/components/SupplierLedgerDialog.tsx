import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Supplier, SupplierPayment, useSupplierLedger, useSupplierPayments } from '@/hooks/useSuppliers';
import { format } from 'date-fns';
import { 
  Loader2, 
  Plus, 
  IndianRupee, 
  Package, 
  CreditCard, 
  AlertCircle,
  Trash2,
  Building2,
  Phone,
  Mail,
  MapPin,
  Landmark,
  Upload,
  X,
  Image as ImageIcon,
  ExternalLink,
  Download
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { 
  exportSupplierPaymentHistoryToExcel, 
  exportSupplierPaymentHistoryToPDF,
  SupplierPaymentHistoryExport
} from '@/lib/exportUtils';

interface SupplierLedgerDialogProps {
  supplier: Supplier | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

import { PAYMENT_MODES } from '@/lib/paymentModes';

interface FileWithPreview {
  file: File;
  preview: string;
  id: string;
}

interface PaymentWithSignedUrls extends SupplierPayment {
  signedUrls?: string[];
}

export function SupplierLedgerDialog({ supplier, open, onOpenChange }: SupplierLedgerDialogProps) {
  const { ledger, loading, refetch } = useSupplierLedger(supplier?.id || '');
  const { createPayment, deletePayment, getSignedUrl } = useSupplierPayments(supplier?.id);
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const canManage = role === 'admin' || role === 'supply_chain';
  const canSeeBankDetails = role === 'admin' || role === 'finance';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showAddPayment, setShowAddPayment] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<FileWithPreview[]>([]);
  const [paymentsWithUrls, setPaymentsWithUrls] = useState<PaymentWithSignedUrls[]>([]);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_type: 'payment',
    payment_mode: 'bank_transfer',
    reference_number: '',
    notes: '',
    payment_date: format(new Date(), 'yyyy-MM-dd'),
  });

  // Load signed URLs for payment screenshots
  useEffect(() => {
    const loadSignedUrls = async () => {
      if (!ledger?.payments) {
        setPaymentsWithUrls([]);
        return;
      }

      const paymentsWithSignedUrls = await Promise.all(
        ledger.payments.map(async (payment) => {
          if (payment.screenshot_urls && payment.screenshot_urls.length > 0) {
            const signedUrls = await Promise.all(
              payment.screenshot_urls.map(async (url) => {
                const signedUrl = await getSignedUrl(url);
                return signedUrl || '';
              })
            );
            return { ...payment, signedUrls: signedUrls.filter(Boolean) };
          }
          return { ...payment, signedUrls: [] };
        })
      );

      setPaymentsWithUrls(paymentsWithSignedUrls);
    };

    loadSignedUrls();
  }, [ledger?.payments, getSignedUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: FileWithPreview[] = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      id: Math.random().toString(36).substring(7),
    }));

    setUploadFiles((prev) => [...prev, ...newFiles]);
    
    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (id: string) => {
    setUploadFiles((prev) => {
      const toRemove = prev.find((f) => f.id === id);
      if (toRemove) {
        URL.revokeObjectURL(toRemove.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleAddPayment = async () => {
    if (!supplier || !paymentForm.amount) return;

    setPaymentLoading(true);
    const success = await createPayment(
      {
        supplier_id: supplier.id,
        order_id: null,
        inventory_procurement_id: null,
        amount: parseFloat(paymentForm.amount),
        payment_type: paymentForm.payment_type,
        payment_mode: paymentForm.payment_mode || null,
        reference_number: paymentForm.reference_number || null,
        notes: paymentForm.notes || null,
        payment_date: paymentForm.payment_date,
      },
      uploadFiles.map((f) => f.file)
    );

    if (success) {
      setShowAddPayment(false);
      setPaymentForm({
        amount: '',
        payment_type: 'payment',
        payment_mode: 'bank_transfer',
        reference_number: '',
        notes: '',
        payment_date: format(new Date(), 'yyyy-MM-dd'),
      });
      // Clean up previews
      uploadFiles.forEach((f) => URL.revokeObjectURL(f.preview));
      setUploadFiles([]);
      refetch();
    }
    setPaymentLoading(false);
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('Are you sure you want to delete this payment record?')) return;
    
    await deletePayment(paymentId);
    refetch();
  };

  const handleCancelAddPayment = () => {
    setShowAddPayment(false);
    uploadFiles.forEach((f) => URL.revokeObjectURL(f.preview));
    setUploadFiles([]);
    setPaymentForm({
      amount: '',
      payment_type: 'payment',
      payment_mode: 'bank_transfer',
      reference_number: '',
      notes: '',
      payment_date: format(new Date(), 'yyyy-MM-dd'),
    });
  };

  if (!supplier) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {supplier.name} - Ledger
          </DialogTitle>
          <DialogDescription>
            Complete payment history and outstanding balance
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : ledger ? (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6">
              {/* Supplier Info */}
              <Card>
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Contact:</span>
                      <span className="font-medium">{supplier.contact_name}</span>
                    </div>
                    {supplier.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <span>{supplier.phone}</span>
                      </div>
                    )}
                    {supplier.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <span className="truncate">{supplier.email}</span>
                      </div>
                    )}
                    {supplier.city && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span>{supplier.city}</span>
                      </div>
                    )}
                  </div>
                  {canSeeBankDetails && supplier.bank_name && (
                    <div className="mt-3 pt-3 border-t flex items-center gap-4 text-sm">
                      <Landmark className="h-4 w-4 text-muted-foreground" />
                      <span>{supplier.bank_name}</span>
                      {supplier.bank_account_number && (
                        <span className="text-muted-foreground">A/C: {supplier.bank_account_number}</span>
                      )}
                      {supplier.bank_ifsc && (
                        <span className="text-muted-foreground">IFSC: {supplier.bank_ifsc}</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Package className="h-4 w-4" />
                      <span className="text-sm">Total Orders</span>
                    </div>
                    <p className="text-2xl font-bold">{ledger.totalOrders}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <IndianRupee className="h-4 w-4" />
                      <span className="text-sm">Total Order Value</span>
                    </div>
                    <p className="text-2xl font-bold">₹{ledger.totalOrderValue.toLocaleString('en-IN')}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-green-600 mb-1">
                      <CreditCard className="h-4 w-4" />
                      <span className="text-sm">Total Paid</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600">₹{ledger.totalPaid.toLocaleString('en-IN')}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-amber-600 mb-1">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">Pending</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-600">
                      ₹{Math.max(0, ledger.pendingAmount).toLocaleString('en-IN')}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Add Payment Form */}
              {showAddPayment ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Record New Payment</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Amount *</Label>
                        <Input
                          type="number"
                          value={paymentForm.amount}
                          onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Payment Type</Label>
                        <Select
                          value={paymentForm.payment_type}
                          onValueChange={(v) => setPaymentForm(prev => ({ ...prev, payment_type: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="payment">Payment</SelectItem>
                            <SelectItem value="advance">Advance</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Payment Mode</Label>
                        <Select
                          value={paymentForm.payment_mode}
                          onValueChange={(v) => setPaymentForm(prev => ({ ...prev, payment_mode: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_MODES.map((mode) => (
                              <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Payment Date</Label>
                        <Input
                          type="date"
                          value={paymentForm.payment_date}
                          onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_date: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Reference Number</Label>
                        <Input
                          value={paymentForm.reference_number}
                          onChange={(e) => setPaymentForm(prev => ({ ...prev, reference_number: e.target.value }))}
                          placeholder="Transaction ID"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        value={paymentForm.notes}
                        onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Payment notes..."
                        rows={2}
                      />
                    </div>

                    {/* Screenshot Upload */}
                    <div className="space-y-2">
                      <Label>Payment Screenshots</Label>
                      <div className="border-2 border-dashed rounded-lg p-4">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        
                        {uploadFiles.length > 0 && (
                          <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mb-4">
                            {uploadFiles.map((f) => (
                              <div key={f.id} className="relative group">
                                <img
                                  src={f.preview}
                                  alt="Preview"
                                  className="w-full h-20 object-cover rounded-md border"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFile(f.id)}
                                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
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
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {uploadFiles.length > 0 ? 'Add More Screenshots' : 'Upload Screenshots'}
                        </Button>
                        <p className="text-xs text-muted-foreground text-center mt-2">
                          Upload payment proof screenshots (multiple allowed)
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={handleCancelAddPayment}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddPayment} disabled={paymentLoading || !paymentForm.amount}>
                        {paymentLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Save Payment
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : canManage && (
                <Button onClick={() => setShowAddPayment(true)} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Record Payment
                </Button>
              )}

              {/* Payment History */}
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Payment History</CardTitle>
                  {paymentsWithUrls.length > 0 && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const exportData: SupplierPaymentHistoryExport = {
                            supplierName: supplier.name,
                            supplierContact: supplier.contact_name,
                            totalPaid: ledger.totalPaid,
                            payments: paymentsWithUrls.map(p => ({
                              date: format(new Date(p.payment_date), 'dd MMM yyyy'),
                              amount: p.amount,
                              type: p.payment_type,
                              mode: p.payment_mode || '',
                              referenceNumber: p.reference_number || '',
                              notes: p.notes || '',
                            })),
                          };
                          exportSupplierPaymentHistoryToExcel(exportData, {
                            filename: `${supplier.name.replace(/\s+/g, '_')}_payments_${format(new Date(), 'yyyy-MM-dd')}`,
                            title: `Payment History - ${supplier.name}`,
                          });
                        }}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Excel
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const exportData: SupplierPaymentHistoryExport = {
                            supplierName: supplier.name,
                            supplierContact: supplier.contact_name,
                            totalPaid: ledger.totalPaid,
                            payments: paymentsWithUrls.map(p => ({
                              date: format(new Date(p.payment_date), 'dd MMM yyyy'),
                              amount: p.amount,
                              type: p.payment_type,
                              mode: p.payment_mode || '',
                              referenceNumber: p.reference_number || '',
                              notes: p.notes || '',
                            })),
                          };
                          exportSupplierPaymentHistoryToPDF(exportData, {
                            filename: `${supplier.name.replace(/\s+/g, '_')}_payments_${format(new Date(), 'yyyy-MM-dd')}`,
                            title: `Payment History - ${supplier.name}`,
                          });
                        }}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        PDF
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {paymentsWithUrls.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">No payments recorded yet</p>
                  ) : (
                    <div className="space-y-3">
                      {paymentsWithUrls.map((payment) => (
                        <div
                          key={payment.id}
                          className="p-3 rounded-lg border bg-secondary/30"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-lg">₹{payment.amount.toLocaleString('en-IN')}</span>
                                <Badge variant="outline" className="capitalize">{payment.payment_type}</Badge>
                                {payment.payment_mode && (
                                  <Badge variant="secondary" className="capitalize">
                                    {payment.payment_mode.replace('_', ' ')}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                {format(new Date(payment.payment_date), 'dd MMM yyyy')}
                                {payment.reference_number && (
                                  <span className="ml-2">• Ref: {payment.reference_number}</span>
                                )}
                              </div>
                              {payment.notes && (
                                <p className="text-sm text-muted-foreground mt-1 italic">"{payment.notes}"</p>
                              )}
                            </div>
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeletePayment(payment.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>

                          {/* Payment Screenshots */}
                          {payment.signedUrls && payment.signedUrls.length > 0 && (
                            <div className="mt-3 pt-3 border-t">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                                <ImageIcon className="h-4 w-4" />
                                <span>Payment Screenshots ({payment.signedUrls.length})</span>
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                {payment.signedUrls.map((url, idx) => (
                                  <a
                                    key={idx}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="relative group"
                                  >
                                    <img
                                      src={url}
                                      alt={`Payment screenshot ${idx + 1}`}
                                      className="h-16 w-16 object-cover rounded border hover:opacity-80 transition-opacity"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded">
                                      <ExternalLink className="h-4 w-4 text-white" />
                                    </div>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        ) : (
          <p className="text-center text-muted-foreground py-8">Supplier not found</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}