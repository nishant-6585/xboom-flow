import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useInventoryProcurements, InventoryProcurement } from '@/hooks/useInventoryProcurements';
import { useInventoryProcurementPayments } from '@/hooks/useInventoryProcurementPayments';
import { useOrders } from '@/hooks/useOrders';
import { useAuth } from '@/hooks/useAuth';
import { SupplierPayment } from '@/hooks/useSuppliers';
import { format, parseISO, isBefore, addDays } from 'date-fns';
import { getPaymentTermsLabel } from '@/lib/paymentTerms';
import { Package, Trash2, CreditCard, AlertTriangle, CheckCircle2, Clock, Loader2, History, Plus, FileText, Send, Ban, Check, Pencil } from 'lucide-react';
import { InventoryProcurementPaymentDialog } from './InventoryProcurementPaymentDialog';
import { InventoryProcurementPaymentHistory } from './InventoryProcurementPaymentHistory';
import { PaymentRequestDialog } from './PaymentRequestDialog';
import { MarkPaymentDoneDialog } from './MarkPaymentDoneDialog';
import { EditProcurementDialog } from './EditProcurementDialog';

export function InventoryProcurementsList() {
  const { procurements, loading, updateProcurement, deleteProcurement, refetch } = useInventoryProcurements();
  const { payments: allPayments, getPaymentsByProcurementMap, refetch: refetchPayments } = useInventoryProcurementPayments();
  const { orders } = useOrders();
  const { role, profile } = useAuth();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [paymentProcurement, setPaymentProcurement] = useState<InventoryProcurement | null>(null);
  const [historyProcurement, setHistoryProcurement] = useState<InventoryProcurement | null>(null);
  const [requestPaymentProcurement, setRequestPaymentProcurement] = useState<{ procurement: InventoryProcurement; remainingBalance: number } | null>(null);
  const [markDonePayment, setMarkDonePayment] = useState<SupplierPayment | null>(null);
  const [editProcurement, setEditProcurement] = useState<InventoryProcurement | null>(null);

  // Create a map of order IDs to order numbers
  const orderNumberMap = new Map(orders.map(o => [o.id, o.order_number || o.id.slice(0, 8)]));

  const isAdmin = role === 'admin';
  const isFinance = role === 'finance';
  const isSupplyChain = role === 'supply_chain';
  const canEdit = isAdmin || isSupplyChain || isFinance;
  const canManagePayments = role === 'admin' || role === 'supply_chain' || role === 'finance';
  const canApprovePayments = role === 'admin' || role === 'finance';
  
  const paymentsByProcurement = getPaymentsByProcurementMap();

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

  const handlePaymentAdded = () => {
    refetch();
    refetchPayments();
  };

  const getPaymentStatusBadge = (procurement: InventoryProcurement, totalPaid: number) => {
    const { payment_due_date } = procurement;
    const totalAmount = procurement.total_amount || 0;
    const remainingBalance = totalAmount - totalPaid;
    
    const isPaidInFull = remainingBalance <= 0 && totalAmount > 0;
    const isPartiallyPaid = totalPaid > 0 && remainingBalance > 0;
    const isOverdue = payment_due_date && isBefore(parseISO(payment_due_date), new Date()) && !isPaidInFull;
    const isDueSoon = payment_due_date && !isOverdue && isBefore(parseISO(payment_due_date), addDays(new Date(), 7)) && !isPaidInFull;

    if (isPaidInFull) {
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

    if (isPartiallyPaid) {
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
            Inventory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proc. No.</TableHead>
                <TableHead>Order No.</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {procurements.map((procurement) => {
                const paymentData = paymentsByProcurement[procurement.id] || { payments: [], totalPaid: 0 };
                const totalAmount = procurement.total_amount || 0;
                const remainingBalance = totalAmount - paymentData.totalPaid;
                const paymentCount = paymentData.payments.length;
                
                // Get pending payment requests for this procurement
                const procurementPayments = allPayments.filter(p => p.inventory_procurement_id === procurement.id);
                const requestedPayments = procurementPayments.filter(p => p.payment_request_status === 'requested');
                const approvedPayments = procurementPayments.filter(p => p.payment_request_status === 'approved');
                const donePayments = procurementPayments.filter(p => p.payment_request_status === 'done');

                return (
                  <TableRow key={procurement.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {procurement.procurement_number || '-'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {procurement.order_id ? (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <FileText className="h-3 w-3" />
                          {orderNumberMap.get(procurement.order_id) || procurement.order_id.slice(0, 8)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">Inventory</span>
                      )}
                    </TableCell>
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
                      {totalAmount ? (
                        `₹${totalAmount.toLocaleString()}`
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className={paymentData.totalPaid > 0 ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'}>
                          ₹{paymentData.totalPaid.toLocaleString()}
                        </span>
                        {paymentCount > 0 && (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => setHistoryProcurement(procurement)}
                          >
                            {paymentCount} payment{paymentCount > 1 ? 's' : ''}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={remainingBalance > 0 ? 'text-orange-600 dark:text-orange-400 font-medium' : 'text-green-600 dark:text-green-400'}>
                        ₹{Math.max(0, remainingBalance).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {getPaymentStatusBadge(procurement, paymentData.totalPaid)}
                        {/* Payment Request Status Badges */}
                        {requestedPayments.length > 0 && (
                          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs">
                            <Send className="h-3 w-3 mr-1" />
                            {requestedPayments.length} Requested
                          </Badge>
                        )}
                        {approvedPayments.length > 0 && (
                          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-xs">
                            <Check className="h-3 w-3 mr-1" />
                            {approvedPayments.length} Approved
                          </Badge>
                        )}
                        {procurement.payment_due_date && (
                          <span className="text-xs text-muted-foreground">
                            Due: {format(parseISO(procurement.payment_due_date), 'dd MMM')}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {format(parseISO(procurement.procurement_date), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {/* Edit button */}
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditProcurement(procurement)}
                            title="Edit Procurement"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        
                        {paymentCount > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setHistoryProcurement(procurement)}
                            title="View Payment History"
                          >
                            <History className="h-4 w-4" />
                          </Button>
                        )}
                        
                        {/* Request Payment button for supply chain team when balance exists */}
                        {procurement.supplier_id && remainingBalance > 0 && canManagePayments && !canApprovePayments && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRequestPaymentProcurement({ procurement, remainingBalance })}
                            title="Request Payment"
                            className="text-yellow-600 border-yellow-300 hover:bg-yellow-50 dark:text-yellow-400 dark:border-yellow-600 dark:hover:bg-yellow-950"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        
                        {/* Mark as Done button for admin/finance on approved payments */}
                        {approvedPayments.length > 0 && canApprovePayments && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setMarkDonePayment(approvedPayments[0])}
                            title="Mark Payment Done"
                            className="text-green-600 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-600 dark:hover:bg-green-950"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                        )}
                        
                        {/* Direct Add Payment for admin/finance */}
                        {procurement.supplier_id && canApprovePayments && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPaymentProcurement(procurement)}
                            title="Add Direct Payment"
                          >
                            <Plus className="h-4 w-4" />
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
                );
              })}
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

      <InventoryProcurementPaymentDialog
        open={!!paymentProcurement}
        onOpenChange={(open) => !open && setPaymentProcurement(null)}
        procurement={paymentProcurement}
        onPaymentAdded={handlePaymentAdded}
      />

      <InventoryProcurementPaymentHistory
        open={!!historyProcurement}
        onOpenChange={(open) => !open && setHistoryProcurement(null)}
        procurement={historyProcurement}
        payments={historyProcurement ? (paymentsByProcurement[historyProcurement.id]?.payments || []) : []}
        totalPaid={historyProcurement ? (paymentsByProcurement[historyProcurement.id]?.totalPaid || 0) : 0}
        onPaymentDeleted={handlePaymentAdded}
      />

      <PaymentRequestDialog
        open={!!requestPaymentProcurement}
        onOpenChange={(open) => !open && setRequestPaymentProcurement(null)}
        procurement={requestPaymentProcurement?.procurement || null}
        remainingBalance={requestPaymentProcurement?.remainingBalance || 0}
        onPaymentRequested={handlePaymentAdded}
      />

      <MarkPaymentDoneDialog
        open={!!markDonePayment}
        onOpenChange={(open) => !open && setMarkDonePayment(null)}
        payment={markDonePayment}
        onPaymentCompleted={handlePaymentAdded}
      />

      <EditProcurementDialog
        open={!!editProcurement}
        onOpenChange={(open) => !open && setEditProcurement(null)}
        procurement={editProcurement}
        onSave={async (id, updates) => {
          const success = await updateProcurement(id, updates);
          if (success) {
            refetch();
          }
          return success;
        }}
      />
    </>
  );
}
