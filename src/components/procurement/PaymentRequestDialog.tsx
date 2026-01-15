import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSupplierPayments } from '@/hooks/useSuppliers';
import { useAuth } from '@/hooks/useAuth';
import { InventoryProcurement } from '@/hooks/useInventoryProcurements';
import { format } from 'date-fns';
import { Loader2, Send, AlertCircle } from 'lucide-react';

interface PaymentRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  procurement: InventoryProcurement | null;
  remainingBalance: number;
  onPaymentRequested?: () => void;
}

export function PaymentRequestDialog({
  open,
  onOpenChange,
  procurement,
  remainingBalance,
  onPaymentRequested,
}: PaymentRequestDialogProps) {
  const { profile } = useAuth();
  const { requestPayment } = useSupplierPayments(procurement?.supplier_id || undefined);
  const [submitting, setSubmitting] = useState(false);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

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
    const success = await requestPayment(
      {
        supplier_id: procurement.supplier_id,
        inventory_procurement_id: procurement.id,
        amount: paymentAmount,
        payment_mode: null,
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        reference_number: null,
        notes: null,
        payment_type: 'inventory_procurement',
        order_id: null,
      },
      notes || undefined,
      profile?.name
    );
    setSubmitting(false);

    if (success) {
      resetForm();
      onOpenChange(false);
      onPaymentRequested?.();
    }
  };

  const resetForm = () => {
    setAmount('');
    setNotes('');
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  if (!procurement) return null;

  const totalAmount = procurement.total_amount || 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Request Payment
          </DialogTitle>
          <DialogDescription>
            Request payment approval for: {procurement.product_name}
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
            <span className="font-medium">₹{totalAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Remaining Balance:</span>
            <span className="font-medium text-orange-600 dark:text-orange-400">
              ₹{remainingBalance.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-blue-800 dark:text-blue-200 text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>This request will be sent to Admin/Finance for approval. Once approved, the payment will be processed.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="requestAmount">Payment Amount (₹) *</Label>
            <Input
              id="requestAmount"
              type="number"
              step="0.01"
              min="0"
              max={remainingBalance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Max: ₹${remainingBalance.toLocaleString()}`}
              required
            />
            <p className="text-xs text-muted-foreground">
              Enter the amount you want to request for payment
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="requestNotes">Notes / Reason</Label>
            <Textarea
              id="requestNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes or reason for this payment request..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !amount}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Request
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
