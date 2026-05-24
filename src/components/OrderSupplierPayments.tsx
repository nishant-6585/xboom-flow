import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useSupplierPayments } from '@/hooks/useSuppliers';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { CalendarIcon, CreditCard, Plus, Loader2, Trash2, X, Image } from 'lucide-react';
import { PAYMENT_MODES } from '@/lib/paymentModes';

interface OrderSupplierPaymentsProps {
  orderId: string;
  supplierId: string | null;
  supplierName: string | null;
  procurementValue: number;
}

export function OrderSupplierPayments({
  orderId,
  supplierId,
  supplierName,
  procurementValue,
}: OrderSupplierPaymentsProps) {
  const { role } = useAuth();
  const canManagePayments = role === 'admin' || role === 'supply_chain' || role === 'finance';
  
  const { payments, createPayment, deletePayment, loading } = useSupplierPayments(supplierId || undefined);
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('bank_transfer');
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentReferenceNumber, setPaymentReferenceNumber] = useState('');
  const [paymentScreenshots, setPaymentScreenshots] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  // Filter payments for this order
  const orderPayments = payments.filter(p => p.order_id === orderId);
  const totalPaid = orderPayments.reduce((sum, p) => sum + p.amount, 0);
  const pendingAmount = procurementValue - totalPaid;

  const handleSubmit = async () => {
    if (!supplierId || !paymentAmount) return;

    setSubmitting(true);
    const success = await createPayment({
      supplier_id: supplierId,
      order_id: orderId,
      inventory_procurement_id: null,
      amount: parseFloat(paymentAmount),
      payment_type: 'payment',
      payment_mode: paymentMode,
      payment_date: format(paymentDate, 'yyyy-MM-dd'),
      notes: paymentNotes || null,
      reference_number: paymentReferenceNumber || null,
    }, paymentScreenshots.length > 0 ? paymentScreenshots : undefined);

    setSubmitting(false);
    if (success) {
      setPaymentAmount('');
      setPaymentNotes('');
      setPaymentReferenceNumber('');
      setPaymentScreenshots([]);
      setPaymentDate(new Date());
      setShowAddForm(false);
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

  if (!supplierId) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-muted-foreground">
          <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Assign a supplier to track payments</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Supplier Payments
            {supplierName && (
              <Badge variant="outline" className="font-normal">
                {supplierName}
              </Badge>
            )}
          </CardTitle>
          {canManagePayments && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Payment
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Payment Summary */}
        <div className="grid grid-cols-3 gap-4 p-3 bg-muted/50 rounded-lg text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Procurement Value</p>
            <p className="font-medium">₹{procurementValue.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="font-medium text-green-600">₹{totalPaid.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className={cn("font-medium", pendingAmount > 0 ? "text-red-600" : "text-green-600")}>
              ₹{pendingAmount.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Add Payment Form */}
        {showAddForm && canManagePayments && (
          <div className="p-4 border rounded-lg space-y-4 bg-background">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount *</Label>
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
                <Label>Payment Date *</Label>
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
                      {paymentDate ? format(paymentDate, "dd MMM yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={paymentDate}
                      onSelect={(date) => date && setPaymentDate(date)}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Reference Number</Label>
                <Input
                  value={paymentReferenceNumber}
                  onChange={(e) => setPaymentReferenceNumber(e.target.value)}
                  placeholder="Transaction ID / UTR"
                />
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

            {/* Screenshots */}
            <div className="space-y-2">
              <Label>Screenshots</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {paymentScreenshots.map((file, index) => (
                  <div key={index} className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs">
                    <Image className="w-3 h-3" />
                    <span className="max-w-[100px] truncate">{file.name}</span>
                    <button onClick={() => handleRemoveScreenshot(index)}>
                      <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => screenshotInputRef.current?.click()}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </Button>
                <input
                  ref={screenshotInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleScreenshotChange}
                  className="hidden"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={submitting || !paymentAmount}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Payment'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Payment History */}
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : orderPayments.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Payment History</p>
            {orderPayments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between p-3 border rounded-lg text-sm"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">₹{payment.amount.toLocaleString()}</span>
                    <Badge variant="outline" className="text-xs capitalize">
                      {payment.payment_mode?.replace('_', ' ') || 'N/A'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {format(new Date(payment.payment_date), 'dd MMM yyyy')}
                    {payment.reference_number && ` • Ref: ${payment.reference_number}`}
                  </div>
                  {payment.notes && (
                    <p className="text-xs text-muted-foreground mt-1">{payment.notes}</p>
                  )}
                </div>
                {canManagePayments && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeletePayment(payment.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-4">
            No payments recorded yet
          </p>
        )}
      </CardContent>
    </Card>
  );
}
