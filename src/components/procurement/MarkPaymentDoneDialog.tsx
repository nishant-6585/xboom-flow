import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SupplierPayment, useSupplierPayments } from '@/hooks/useSuppliers';
import { useAuth } from '@/hooks/useAuth';
import { format, parseISO } from 'date-fns';
import { Loader2, X, Upload, CheckCircle2, User, Calendar, FileText } from 'lucide-react';

interface MarkPaymentDoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: SupplierPayment | null;
  onPaymentCompleted?: () => void;
}

import { PAYMENT_MODES } from '@/lib/paymentModes';

export function MarkPaymentDoneDialog({
  open,
  onOpenChange,
  payment,
  onPaymentCompleted,
}: MarkPaymentDoneDialogProps) {
  const { profile } = useAuth();
  const { markPaymentDone } = useSupplierPayments(payment?.supplier_id || undefined);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMode, setPaymentMode] = useState('bank_transfer');
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [screenshots, setScreenshots] = useState<File[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!payment) {
      return;
    }

    if (screenshots.length === 0) {
      return;
    }

    setSubmitting(true);
    const success = await markPaymentDone(
      payment.id,
      profile?.name || 'Unknown',
      screenshots,
      {
        payment_mode: paymentMode,
        payment_date: paymentDate,
        reference_number: referenceNumber || undefined,
        notes: notes || undefined,
      }
    );
    setSubmitting(false);

    if (success) {
      resetForm();
      onOpenChange(false);
      onPaymentCompleted?.();
    }
  };

  const resetForm = () => {
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

  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Mark Payment as Done
          </DialogTitle>
          <DialogDescription>
            Complete this payment request with proof of payment
          </DialogDescription>
        </DialogHeader>

        {/* Payment Request Info */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Amount:</span>
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-base font-semibold">
              ₹{payment.amount.toLocaleString()}
            </Badge>
          </div>
          
          {payment.requested_by_name && (
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Requested by:</span>
              <span className="font-medium">{payment.requested_by_name}</span>
            </div>
          )}
          
          {payment.requested_at && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Requested on:</span>
              <span className="font-medium">{format(parseISO(payment.requested_at), 'dd MMM yyyy, HH:mm')}</span>
            </div>
          )}
          
          {payment.request_notes && (
            <div className="flex items-start gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <span className="text-muted-foreground">Notes: </span>
                <span>{payment.request_notes}</span>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paymentMode">Payment Mode *</Label>
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
            <div className="space-y-2">
              <Label htmlFor="paymentDate">Payment Date</Label>
              <Input
                id="paymentDate"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="referenceNumber">Reference / Transaction No.</Label>
            <Input
              id="referenceNumber"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="UTR / Transaction ID"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Payment Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this payment..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Payment Screenshot *</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('payment-screenshot-input')?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Screenshot
              </Button>
              <input
                id="payment-screenshot-input"
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
            {screenshots.length === 0 && (
              <p className="text-xs text-destructive">Screenshot is required as proof of payment</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={submitting || screenshots.length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Completing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Mark as Done
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
