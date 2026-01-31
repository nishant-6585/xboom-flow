import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Invoice, InvoiceStatus, INVOICE_STATUSES, useInvoices } from '@/hooks/useInvoices';
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
  CheckCircle2,
  XCircle,
  Pencil,
  CreditCard
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface InvoiceCardProps {
  invoice: Invoice;
  onView: (invoice: Invoice) => void;
  onEdit?: (invoice: Invoice) => void;
  onRecordPayment?: (invoice: Invoice) => void;
}

export function InvoiceCard({ invoice, onView, onEdit, onRecordPayment }: InvoiceCardProps) {
  const { role } = useAuth();
  const { updateInvoiceStatus, deleteInvoice } = useInvoices();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const statusConfig = INVOICE_STATUSES.find(s => s.value === invoice.status);
  const isPaid = invoice.status === 'paid';
  const isCancelled = invoice.status === 'cancelled';
  const canEdit = !isPaid && !isCancelled;

  const handleStatusChange = async (newStatus: InvoiceStatus) => {
    await updateInvoiceStatus(invoice.id, newStatus);
  };

  const handleDelete = async () => {
    await deleteInvoice(invoice.id);
    setDeleteDialogOpen(false);
  };

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base font-semibold">{invoice.invoice_number}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {format(new Date(invoice.invoice_date), 'dd MMM yyyy')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`${statusConfig?.color} text-white`}>
                {statusConfig?.label}
              </Badge>
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
                  <DropdownMenuItem>
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </DropdownMenuItem>
                  {!isPaid && !isCancelled && (
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
                      <DropdownMenuItem onClick={() => handleStatusChange('cancelled')}>
                        <XCircle className="h-4 w-4 mr-2" />
                        Cancel Invoice
                      </DropdownMenuItem>
                    </>
                  )}
                  {role === 'admin' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => setDeleteDialogOpen(true)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
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
