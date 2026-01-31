import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Invoice, InvoiceStatus, useInvoices } from '@/hooks/useInvoices';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { format } from 'date-fns';
import { 
  MoreVertical, 
  Download, 
  Eye, 
  Trash2, 
  User, 
  Building2, 
  Calendar,
  IndianRupee,
  Send,
  XCircle,
  Pencil,
  CreditCard,
  PenTool,
  FileSignature,
  Archive,
  Lock,
  CheckCircle
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface InvoiceCardProps {
  invoice: Invoice;
  onView: (invoice: Invoice) => void;
  onEdit?: (invoice: Invoice) => void;
  onRecordPayment?: (invoice: Invoice) => void;
  onSubmitForSignature?: (invoice: Invoice) => void;
  onSign?: (invoice: Invoice) => void;
}

export function InvoiceCard({ 
  invoice, 
  onView, 
  onEdit, 
  onRecordPayment,
  onSubmitForSignature,
  onSign,
}: InvoiceCardProps) {
  const { role } = useAuth();
  const { updateInvoiceStatus, deleteInvoice, archiveInvoice, canEditInvoice, canDownloadInvoice } = useInvoices();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const isDraft = invoice.status === 'draft';
  const isPendingSignature = invoice.status === 'pending_signature';
  const isSigned = invoice.status === 'signed';
  const isPaid = invoice.status === 'paid';
  const isCancelled = invoice.status === 'cancelled';
  const canEdit = canEditInvoice(invoice);
  const canDownload = canDownloadInvoice(invoice);
  const isAdmin = role === 'admin';

  const handleStatusChange = async (newStatus: InvoiceStatus) => {
    await updateInvoiceStatus(invoice.id, newStatus);
  };

  const handleDelete = async () => {
    await deleteInvoice(invoice.id);
    setDeleteDialogOpen(false);
  };

  const handleArchive = async () => {
    await archiveInvoice(invoice.id);
  };

  const handleDownload = () => {
    if (!canDownload) {
      toast.error('Invoice must be signed before downloading');
      return;
    }
    // TODO: Implement PDF download
    toast.info('PDF download coming soon');
  };

  return (
    <>
      <Card className={`hover:shadow-md transition-shadow ${isSigned ? 'border-green-200' : ''}`}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                {invoice.invoice_number}
                {isSigned && <Lock className="h-3 w-3 text-green-600" />}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {format(new Date(invoice.invoice_date), 'dd MMM yyyy')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <InvoiceStatusBadge status={invoice.status} size="sm" />
              {canEdit && onEdit && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => onEdit(invoice)}
                  title="Edit Invoice"
                >
                  <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(invoice)}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </DropdownMenuItem>
                  
                  {/* Download - only for signed invoices */}
                  {canDownload ? (
                    <DropdownMenuItem onClick={handleDownload}>
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem disabled className="text-muted-foreground">
                      <Download className="h-4 w-4 mr-2" />
                      <span className="text-xs">Sign to Download</span>
                    </DropdownMenuItem>
                  )}

                  {/* Draft actions */}
                  {isDraft && (
                    <>
                      <DropdownMenuSeparator />
                      {onSubmitForSignature && (
                        <DropdownMenuItem onClick={() => onSubmitForSignature(invoice)} className="text-orange-600">
                          <FileSignature className="h-4 w-4 mr-2" />
                          Submit for Signature
                        </DropdownMenuItem>
                      )}
                    </>
                  )}

                  {/* Pending Signature - Admin only can sign */}
                  {isPendingSignature && isAdmin && onSign && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onSign(invoice)} className="text-green-600 font-medium">
                        <PenTool className="h-4 w-4 mr-2" />
                        Finalize & Sign
                      </DropdownMenuItem>
                    </>
                  )}

                  {/* Signed invoice actions */}
                  {isSigned && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleStatusChange('sent')}>
                        <Send className="h-4 w-4 mr-2" />
                        Mark as Sent
                      </DropdownMenuItem>
                      {onRecordPayment && (
                        <DropdownMenuItem onClick={() => onRecordPayment(invoice)} className="text-green-600">
                          <CreditCard className="h-4 w-4 mr-2" />
                          Record Payment
                        </DropdownMenuItem>
                      )}
                    </>
                  )}

                  {/* Cancel - only for non-signed invoices */}
                  {!isSigned && !isPaid && !isCancelled && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleStatusChange('cancelled')}>
                        <XCircle className="h-4 w-4 mr-2" />
                        Cancel Invoice
                      </DropdownMenuItem>
                    </>
                  )}

                  {/* Admin actions */}
                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      {isSigned ? (
                        <DropdownMenuItem onClick={handleArchive}>
                          <Archive className="h-4 w-4 mr-2" />
                          Archive
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem 
                          onClick={() => setDeleteDialogOpen(true)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Customer Info */}
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{invoice.customer_name}</span>
          </div>
          {invoice.customer_company && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span>{invoice.customer_company}</span>
            </div>
          )}

          {/* Signed By */}
          {invoice.signed_by_name && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span>Signed by {invoice.signed_by_name}</span>
            </div>
          )}

          {/* Due Date */}
          {invoice.due_date && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Due: {format(new Date(invoice.due_date), 'dd MMM yyyy')}</span>
            </div>
          )}

          {/* Amount */}
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm text-muted-foreground">Total Amount</span>
            <div className="flex items-center gap-1 font-bold text-lg">
              <IndianRupee className="h-4 w-4" />
              {invoice.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>

          {/* Balance Due */}
          {invoice.balance_due > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Balance Due</span>
              <span className="text-red-600 font-semibold">
                ₹{invoice.balance_due.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Created By */}
          <div className="text-xs text-muted-foreground">
            Created by: {invoice.created_by_name}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete invoice {invoice.invoice_number}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
