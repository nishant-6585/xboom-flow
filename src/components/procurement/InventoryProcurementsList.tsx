import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useInventoryProcurements, InventoryProcurement } from '@/hooks/useInventoryProcurements';
import { useSupplierPayments } from '@/hooks/useSuppliers';
import { useAuth } from '@/hooks/useAuth';
import { format, parseISO, isAfter, isBefore, addDays } from 'date-fns';
import { getPaymentTermsLabel } from '@/lib/paymentTerms';
import { Package, Trash2, CreditCard, AlertTriangle, CheckCircle2, Clock, Loader2 } from 'lucide-react';

interface InventoryProcurementsListProps {
  onAddPayment?: (procurement: InventoryProcurement) => void;
}

export function InventoryProcurementsList({ onAddPayment }: InventoryProcurementsListProps) {
  const { procurements, loading, updateProcurement, deleteProcurement } = useInventoryProcurements();
  const { role } = useAuth();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = role === 'admin';

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    await deleteProcurement(deleteId);
    setDeleting(false);
    setDeleteId(null);
  };

  const handlePaymentStatusChange = async (id: string, status: string) => {
    await updateProcurement(id, { payment_status: status });
  };

  const getPaymentStatusBadge = (procurement: InventoryProcurement) => {
    const { payment_status, payment_due_date } = procurement;
    const isOverdue = payment_due_date && isBefore(parseISO(payment_due_date), new Date()) && payment_status !== 'paid';
    const isDueSoon = payment_due_date && !isOverdue && isBefore(parseISO(payment_due_date), addDays(new Date(), 7)) && payment_status !== 'paid';

    if (payment_status === 'paid') {
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Paid
        </Badge>
      );
    }

    if (isOverdue) {
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Overdue
        </Badge>
      );
    }

    if (isDueSoon) {
      return (
        <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
          <Clock className="h-3 w-3 mr-1" />
          Due Soon
        </Badge>
      );
    }

    if (payment_status === 'partial') {
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          Partial
        </Badge>
      );
    }

    return (
      <Badge variant="secondary">
        <Clock className="h-3 w-3 mr-1" />
        Pending
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (procurements.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-medium text-lg">No Manual Procurements</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Create a manual procurement to add inventory without an order.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Inventory Procurements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {procurements.map((procurement) => (
                <TableRow key={procurement.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{procurement.product_name}</p>
                      <p className="text-xs text-muted-foreground">{procurement.product_category}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {procurement.supplier_name || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{procurement.quantity}</TableCell>
                  <TableCell className="text-right">
                    {procurement.total_amount ? (
                      `₹${procurement.total_amount.toLocaleString()}`
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={procurement.payment_status}
                      onValueChange={(value) => handlePaymentStatusChange(procurement.id, value)}
                    >
                      <SelectTrigger className="w-[120px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="partial">Partial</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {getPaymentStatusBadge(procurement)}
                      {procurement.payment_due_date && (
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(procurement.payment_due_date), 'dd MMM yyyy')}
                        </span>
                      )}
                      {procurement.payment_terms && (
                        <span className="text-xs text-muted-foreground">
                          {getPaymentTermsLabel(procurement.payment_terms)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {format(parseISO(procurement.procurement_date), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      {procurement.supplier_id && onAddPayment && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onAddPayment(procurement)}
                        >
                          <CreditCard className="h-4 w-4" />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(procurement.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Procurement</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this procurement record? This will not reverse the inventory addition.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
