import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { InventoryProcurement } from '@/hooks/useInventoryProcurements';
import { SupplierPayment, useSupplierPayments } from '@/hooks/useSuppliers';
import { useAuth } from '@/hooks/useAuth';
import { format, parseISO } from 'date-fns';
import { CreditCard, Calendar, Hash, FileText, Image, Trash2, Loader2, IndianRupee, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PAYMENT_MODE_LABELS } from '@/lib/paymentModes';

interface InventoryProcurementPaymentHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  procurement: InventoryProcurement | null;
  payments: SupplierPayment[];
  totalPaid: number;
  onPaymentDeleted?: () => void;
}

export function InventoryProcurementPaymentHistory({
  open,
  onOpenChange,
  procurement,
  payments,
  totalPaid,
  onPaymentDeleted,
}: InventoryProcurementPaymentHistoryProps) {
  const { role } = useAuth();
  const { deletePayment, getSignedUrl } = useSupplierPayments(procurement?.supplier_id || undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [viewingScreenshot, setViewingScreenshot] = useState<string | null>(null);

  const isAdmin = role === 'admin';

  if (!procurement) return null;

  const totalAmount = procurement.total_amount || 0;
  const remainingBalance = totalAmount - totalPaid;
  const isPaidInFull = remainingBalance <= 0;

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    setDeletingId(confirmDeleteId);
    await deletePayment(confirmDeleteId);
    setDeletingId(null);
    setConfirmDeleteId(null);
    onPaymentDeleted?.();
  };

  const handleViewScreenshot = async (path: string) => {
    const url = await getSignedUrl(path);
    if (url) {
      setViewingScreenshot(url);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment History
            </DialogTitle>
            <DialogDescription>
              {procurement.product_name} - {procurement.supplier_name || 'Unknown Supplier'}
            </DialogDescription>
          </DialogHeader>

          {/* Summary Section */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Amount</p>
              <p className="font-semibold text-lg">₹{totalAmount.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Paid</p>
              <p className="font-semibold text-lg text-green-600 dark:text-green-400">
                ₹{totalPaid.toLocaleString()}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Remaining</p>
              <p className={`font-semibold text-lg ${isPaidInFull ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                ₹{Math.max(0, remainingBalance).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex justify-center">
            {isPaidInFull ? (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Paid in Full
              </Badge>
            ) : (
              <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                <AlertCircle className="h-3 w-3 mr-1" />
                ₹{remainingBalance.toLocaleString()} Pending
              </Badge>
            )}
          </div>

          <Separator />

          {/* Payment History List */}
          <div>
            <h4 className="text-sm font-medium mb-3">Payment Records ({payments.length})</h4>
            
            {payments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <IndianRupee className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No payments recorded yet</p>
              </div>
            ) : (
              <ScrollArea className="h-[280px] pr-4">
                <div className="space-y-3">
                  {payments.map((payment, index) => {
                    // Calculate running balance
                    const paymentsUntilThis = payments.slice(index);
                    const paidAfterThis = paymentsUntilThis.reduce((sum, p) => sum + p.amount, 0);
                    const balanceAfterThis = totalAmount - paidAfterThis;

                    return (
                      <div
                        key={payment.id}
                        className="p-3 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-green-600 dark:text-green-400">
                              +₹{payment.amount.toLocaleString()}
                            </span>
                            {payment.payment_mode && (
                              <Badge variant="outline" className="text-xs">
                                {PAYMENT_MODE_LABELS[payment.payment_mode] || payment.payment_mode}
                              </Badge>
                            )}
                          </div>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => setConfirmDeleteId(payment.id)}
                              disabled={deletingId === payment.id}
                            >
                              {deletingId === payment.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(parseISO(payment.payment_date), 'dd MMM yyyy')}
                          </div>
                          {payment.reference_number && (
                            <div className="flex items-center gap-1">
                              <Hash className="h-3 w-3" />
                              {payment.reference_number}
                            </div>
                          )}
                        </div>

                        {payment.notes && (
                          <div className="flex items-start gap-1 mt-2 text-xs text-muted-foreground">
                            <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>{payment.notes}</span>
                          </div>
                        )}

                        {payment.screenshot_urls && payment.screenshot_urls.length > 0 && (
                          <div className="flex items-center gap-2 mt-2">
                            {payment.screenshot_urls.map((url, idx) => (
                              <Button
                                key={idx}
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => handleViewScreenshot(url)}
                              >
                                <Image className="h-3 w-3 mr-1" />
                                View
                              </Button>
                            ))}
                          </div>
                        )}

                        <div className="mt-2 pt-2 border-t text-xs">
                          <span className="text-muted-foreground">Balance after: </span>
                          <span className={balanceAfterThis <= 0 ? 'text-green-600 dark:text-green-400' : ''}>
                            ₹{Math.max(0, balanceAfterThis).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this payment record? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Screenshot Viewer */}
      <Dialog open={!!viewingScreenshot} onOpenChange={() => setViewingScreenshot(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Payment Screenshot</DialogTitle>
          </DialogHeader>
          {viewingScreenshot && (
            <img
              src={viewingScreenshot}
              alt="Payment screenshot"
              className="w-full h-auto max-h-[70vh] object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
