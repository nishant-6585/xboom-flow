import { useState, useMemo } from "react";
import { useSuppliers, useSupplierPayments, Supplier } from "@/hooks/useSuppliers";
import { useOrders } from "@/hooks/useOrders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Building2, TrendingUp, TrendingDown, Eye } from "lucide-react";
import { SupplierLedgerDialog } from "@/components/SupplierLedgerDialog";

interface SupplierSummary {
  supplier: Supplier;
  totalOrders: number;
  totalProcurementValue: number;
  totalPaid: number;
  pendingAmount: number;
}

export function ProcurementLedger() {
  const { suppliers, loading: suppliersLoading } = useSuppliers();
  const { payments, loading: paymentsLoading } = useSupplierPayments();
  const { orders, loading: ordersLoading } = useOrders();
  const [search, setSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [ledgerDialogOpen, setLedgerDialogOpen] = useState(false);

  const supplierSummaries = useMemo((): SupplierSummary[] => {
    return suppliers.map(supplier => {
      // Orders linked to this supplier
      const supplierOrders = orders.filter(o => o.supplier_name === supplier.name);
      
      // Payments to this supplier
      const supplierPayments = payments.filter(p => p.supplier_id === supplier.id);
      
      const totalProcurementValue = supplierOrders.reduce((sum, o) => {
        return sum + ((o.procurement_rate || 0) * (o.quantity || 1));
      }, 0);
      
      const totalPaid = supplierPayments.reduce((sum, p) => sum + p.amount, 0);
      
      return {
        supplier,
        totalOrders: supplierOrders.length,
        totalProcurementValue,
        totalPaid,
        pendingAmount: totalProcurementValue - totalPaid,
      };
    });
  }, [suppliers, orders, payments]);

  const filteredSummaries = useMemo(() => {
    return supplierSummaries.filter(summary => 
      summary.supplier.name.toLowerCase().includes(search.toLowerCase()) ||
      summary.supplier.contact_name.toLowerCase().includes(search.toLowerCase())
    );
  }, [supplierSummaries, search]);

  // Calculate totals
  const totals = useMemo(() => {
    return filteredSummaries.reduce((acc, s) => ({
      orders: acc.orders + s.totalOrders,
      procurement: acc.procurement + s.totalProcurementValue,
      paid: acc.paid + s.totalPaid,
      pending: acc.pending + s.pendingAmount,
    }), { orders: 0, procurement: 0, paid: 0, pending: 0 });
  }, [filteredSummaries]);

  const handleViewLedger = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setLedgerDialogOpen(true);
  };

  const loading = suppliersLoading || paymentsLoading || ordersLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">Loading ledger...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Suppliers</p>
                <p className="text-2xl font-bold">{suppliers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <TrendingUp className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Procurement</p>
                <p className="text-2xl font-bold">₹{totals.procurement.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Paid</p>
                <p className="text-2xl font-bold text-green-600">₹{totals.paid.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <TrendingDown className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Pending</p>
                <p className="text-2xl font-bold text-red-600">₹{totals.pending.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ledger Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Supplier Ledger
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search suppliers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 max-w-sm"
            />
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Orders</TableHead>
                  <TableHead className="text-right">Procurement Value</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSummaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No suppliers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSummaries.map(({ supplier, totalOrders, totalProcurementValue, totalPaid, pendingAmount }) => (
                    <TableRow key={supplier.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{supplier.name}</p>
                          <p className="text-xs text-muted-foreground">{supplier.contact_name}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{supplier.product_category}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{totalOrders}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ₹{totalProcurementValue.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        ₹{totalPaid.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={pendingAmount > 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                          ₹{pendingAmount.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleViewLedger(supplier)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selectedSupplier && (
        <SupplierLedgerDialog
          supplier={selectedSupplier}
          open={ledgerDialogOpen}
          onOpenChange={setLedgerDialogOpen}
        />
      )}
    </div>
  );
}
