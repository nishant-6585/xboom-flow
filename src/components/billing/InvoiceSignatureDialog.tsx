import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Invoice } from '@/hooks/useInvoices';
import { useAdminSignature } from '@/hooks/useAdminSignature';
import { Loader2, AlertTriangle, PenTool, Lock, FileText } from 'lucide-react';
import { format } from 'date-fns';

interface InvoiceSignatureDialogProps {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSign: (invoiceId: string) => Promise<boolean>;
}

export function InvoiceSignatureDialog({
  invoice,
  open,
  onOpenChange,
  onSign,
}: InvoiceSignatureDialogProps) {
  const { signatureImageUrl, hasSignature, loading: signatureLoading } = useAdminSignature();
  const [signing, setSigning] = useState(false);

  if (!invoice) return null;

  const handleSign = async () => {
    setSigning(true);
    try {
      const success = await onSign(invoice.id);
      if (success) {
        onOpenChange(false);
      }
    } finally {
      setSigning(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <PenTool className="h-5 w-5" />
            Finalize & Sign Invoice
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                You are about to sign and finalize invoice <strong>{invoice.invoice_number}</strong>.
              </p>

              {/* Invoice Summary */}
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-medium">{invoice.customer_name}</span>
                </div>
                {invoice.customer_company && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Company:</span>
                    <span>{invoice.customer_company}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-bold">₹{invoice.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Date:</span>
                  <span>{format(new Date(invoice.invoice_date), 'dd MMM yyyy')}</span>
                </div>
              </div>

              {/* Signature Preview */}
              {signatureLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : hasSignature && signatureImageUrl ? (
                <div className="border rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-2">Your signature will be embedded:</p>
                  <div className="flex justify-center bg-white rounded p-2">
                    <img 
                      src={signatureImageUrl} 
                      alt="Your signature" 
                      className="max-h-[60px] object-contain"
                    />
                  </div>
                </div>
              ) : (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No signature uploaded. Please upload your signature in Admin Settings before signing invoices.
                  </AlertDescription>
                </Alert>
              )}

              {/* Warning */}
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertDescription>
                  <strong>This action is permanent.</strong> Once signed, this invoice cannot be edited or deleted. A PDF will be generated with your signature embedded.
                </AlertDescription>
              </Alert>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={signing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSign}
            disabled={signing || !hasSignature || signatureLoading}
            className="bg-green-600 hover:bg-green-700"
          >
            {signing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Signing...
              </>
            ) : (
              <>
                <PenTool className="h-4 w-4 mr-2" />
                Sign Invoice
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
