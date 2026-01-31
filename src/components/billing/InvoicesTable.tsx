import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Invoice, INVOICE_STATUSES, useInvoices } from '@/hooks/useInvoices';
import { format } from 'date-fns';
import { MoreHorizontal, Eye, Download, Send, CreditCard, XCircle, Trash2, Pencil } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface InvoicesTableProps {
  invoices: Invoice[];
  onView: (invoice: Invoice) => void;
  onEdit?: (invoice: Invoice) => void;
  onRecordPayment?: (invoice: Invoice) => void;
}

export function InvoicesTable({ invoices, onView, onEdit, onRecordPayment }: InvoicesTableProps) {
  const { role } = useAuth();
  const { updateInvoiceStatus, deleteInvoice } = useInvoices();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);

  const handleDelete = async () => {
    if (invoiceToDelete) {
      await deleteInvoice(invoiceToDelete.id);
      setDeleteDialogOpen(false);
      setInvoiceToDelete(null);
    }
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => {
              const statusConfig = INVOICE_STATUSES.find(s => s.value === invoice.status);
              const isPaid = invoice.status === 'paid';
              const isCancelled = invoice.status === 'cancelled';
              const canEdit = !isPaid && !isCancelled;

              return (
                <TableRow key={invoice.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium" onClick={() => onView(invoice)}>
                    {invoice.invoice_number}
                  </TableCell>
                  <TableCell onClick={() => onView(invoice)}>
                    <div>
                      <p className="font-medium">{invoice.customer_name}</p>
                      {invoice.customer_company && (
                        <p className="text-xs text-muted-foreground">{invoice.customer_company}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell onClick={() => onView(invoice)}>
                    {format(new Date(invoice.invoice_date), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell onClick={() => onView(invoice)}>
                    {invoice.due_date ? format(new Date(invoice.due_date), 'dd MMM yyyy') : '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium" onClick={() => onView(invoice)}>
                    ₹{invoice.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right text-green-600" onClick={() => onView(invoice)}>
                    ₹{invoice.amount_paid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right text-red-600" onClick={() => onView(invoice)}>
                    ₹{invoice.balance_due.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell onClick={() => onView(invoice)}>
                    <Badge className={`${statusConfig?.color} text-white`}>
                      {statusConfig?.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onView(invoice)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        {canEdit && onEdit && (
                          <DropdownMenuItem onClick={() => onEdit(invoice)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit Invoice
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem>
                          <Download className="h-4 w-4 mr-2" />
                          Download PDF
                        </DropdownMenuItem>
                        {!isPaid && !isCancelled && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => updateInvoiceStatus(invoice.id, 'sent')}>
                              <Send className="h-4 w-4 mr-2" />
                              Mark as Sent
                            </DropdownMenuItem>
                            {onRecordPayment && (
                              <DropdownMenuItem onClick={() => onRecordPayment(invoice)} className="text-green-600">
                                <CreditCard className="h-4 w-4 mr-2" />
                                Record Payment
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => updateInvoiceStatus(invoice.id, 'cancelled')}>
                              <XCircle className="h-4 w-4 mr-2" />
                              Cancel Invoice
                            </DropdownMenuItem>
                          </>
                        )}
                        {role === 'admin' && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => { setInvoiceToDelete(invoice); setDeleteDialogOpen(true); }}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete invoice {invoiceToDelete?.invoice_number}? This action cannot be undone.
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
