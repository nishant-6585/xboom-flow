import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useProcurementPaymentRequests } from '@/hooks/useProcurementPaymentRequests';

interface PaymentStatusRequestDialogProps {
  orderId: string;
  orderNumber: string | null;
  productName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function PaymentStatusRequestDialog({
  orderId,
  orderNumber,
  productName,
  open,
  onOpenChange,
  onSuccess,
}: PaymentStatusRequestDialogProps) {
  const { createRequest } = useProcurementPaymentRequests();
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    const success = await createRequest(orderId, notes);
    setLoading(false);

    if (success) {
      setNotes('');
      onOpenChange(false);
      onSuccess?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request Payment Status</DialogTitle>
          <DialogDescription>
            Submit a request for payment status approval for order{' '}
            <span className="font-medium">{orderNumber || productName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this payment request..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
