import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSupplierPayments } from '@/hooks/useSuppliers';
import { InventoryProcurement } from '@/hooks/useInventoryProcurements';
import { format } from 'date-fns';
import { Loader2, X, Upload, CreditCard } from 'lucide-react';

interface InventoryProcurementPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  procurement: InventoryProcurement | null;
  onPaymentAdded?: () => void;
}

import { PAYMENT_MODES } from '@/lib/paymentModes';

export function InventoryProcurementPaymentDialog({
  open,
  onOpenChange,
  procurement,
  onPaymentAdded,
}: InventoryProcurementPaymentDialogProps) {
  const { createPayment } = useSupplierPayments(procurement?.supplier_id || undefined);
  const [submitting, setSubmitting] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('bank_transfer');
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [screenshots, setScreenshots] = useState<File[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!procurement?.supplier_id) {
      return;
    }

    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return;
    }

    setSubmitting(true);
    const success = await createPayment(
      {
        supplier_id: procurement.supplier_id,
        inventory_procurement_id: procurement.id,
        amount: paymentAmount,
        payment_mode: paymentMode,
        payment_date: paymentDate,
        reference_number: referenceNumber || null,
        notes: notes || null,
        payment_type: 'inventory_procurement',
        order_id: null,
      },
      screenshots.length > 0 ? screenshots : undefined
    );
    setSubmitting(false);

    if (success) {
      resetForm();
      onOpenChange(false);
      onPaymentAdded?.();
    }
  };

  const resetForm = () => {
    setAmount('');
    setPaymentMode('bank_transfer');
    setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
    setReferenceNumber('');
    setNotes('');
    setScreenshots([]);
  };

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setScreenshots((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handleRemoveScreenshot = (index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  if (!procurement) return null;

  const pendingAmount = (procurement.total_amount || 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Record Payment
          </DialogTitle>
          <DialogDescription>
            Record a payment for procurement: {procurement.product_name}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Supplier:</span>
            <span className="font-medium">{procurement.supplier_name || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Product:</span>
            <span className="font-medium">{procurement.product_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Amount:</span>
            <span className="font-medium">₹{pendingAmount.toLocaleString()}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₹) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentMode">Payment Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paymentDate">Payment Date</Label>
              <Input
                id="paymentDate"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="referenceNumber">Reference No.</Label>
              <Input
                id="referenceNumber"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Transaction ID"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Screenshot (Optional)</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('screenshot-input')?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
              <input
                id="screenshot-input"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleScreenshotChange}
              />
            </div>
            {screenshots.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {screenshots.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs"
                  >
                    <span className="truncate max-w-[100px]">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveScreenshot(index)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !amount}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Recording...
                </>
              ) : (
                'Record Payment'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
