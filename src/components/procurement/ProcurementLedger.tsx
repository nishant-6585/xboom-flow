import { useState, useMemo } from "react";
import { useSuppliers, useSupplierPayments, Supplier } from "@/hooks/useSuppliers";
import { useOrders } from "@/hooks/useOrders";
import { useImports } from "@/hooks/useImports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, Building2, TrendingUp, TrendingDown, Eye, Download, FileSpreadsheet, FileText, AlertTriangle } from "lucide-react";
import { formatINR } from "@/lib/currency";
import { SupplierLedgerDialog } from "@/components/SupplierLedgerDialog";
import { exportSupplierLedgerToExcel, exportSupplierLedgerToPDF, SupplierLedgerExportData } from "@/lib/exportUtils";
import { toast } from "sonner";
import { format } from "date-fns";

interface SupplierSummary {
  supplier: Supplier;
  totalOrders: number;
  totalImports: number;
  totalProcurementValue: number;
  totalPaid: number;
  pendingAmount: number;
}

export function ProcurementLedger() {
  const { suppliers, loading: suppliersLoading } = useSuppliers();
  const { payments, loading: paymentsLoading } = useSupplierPayments();
  const { orders, loading: ordersLoading } = useOrders();
  const { imports, loading: importsLoading } = useImports();
  const [search, setSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [ledgerDialogOpen, setLedgerDialogOpen] = useState(false);

  /**
   * Group orders by supplier ONCE, keyed on supplier_id.
   *
   * This used to be `orders.filter(o => o.supplier_name === supplier.name)`
   * evaluated per supplier: O(suppliers x orders), and matched on a display
   * string while payments matched on supplier_id. A supplier rename, a trailing
   * space, or a difference in case silently dropped orders out of that
   * supplier's payable balance — while their payments stayed, showing a credit
   * that did not exist.
   *
   * Orders raised before the picker started writing supplier_id (and orders
   * whose supplier was typed free-hand in the order form) still carry only a
   * name, so a normalised-name index backs the id lookup up. Anything that
   * resolves by neither is reported as unattributed rather than dropped.
   */
  const { ordersBySupplier, unattributedOrders, unattributedValue } = useMemo(() => {
    const byId = new Map<string, typeof orders>();
    const idByNormalisedName = new Map<string, string>();
    const ambiguousNames = new Set<string>();

    for (const supplier of suppliers) {
      byId.set(supplier.id, []);
      const key = supplier.name?.trim().toLowerCase();
      if (!key) continue;
      if (idByNormalisedName.has(key)) ambiguousNames.add(key);
      else idByNormalisedName.set(key, supplier.id);
    }

    const unattributed: typeof orders = [];

    for (const order of orders) {
      let supplierId = order.supplier_id && byId.has(order.supplier_id)
        ? order.supplier_id
        : null;

      if (!supplierId && order.supplier_name) {
        const key = order.supplier_name.trim().toLowerCase();
        // A name shared by two suppliers cannot be attributed safely.
        if (!ambiguousNames.has(key)) supplierId = idByNormalisedName.get(key) ?? null;
      }

      if (supplierId) byId.get(supplierId)!.push(order);
      else if (order.procurement_rate) unattributed.push(order);
    }

    return {
      ordersBySupplier: byId,
      unattributedOrders: unattributed.length,
      unattributedValue: unattributed.reduce(
        (sum, o) => sum + (o.procurement_rate || 0) * (o.quantity || 1),
        0
      ),
    };
  }, [suppliers, orders]);

  /**
   * Imports are a payable to the same suppliers as orders, and their payments
   * already land in supplier_payments — so leaving them out of the value side
   * made every importing supplier look overpaid. Valued at landed cost, which
   * is what the business is actually out of pocket for.
   */
  const importsBySupplier = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    for (const imp of imports) {
      if (!imp.supplier_id) continue;
      const current = map.get(imp.supplier_id) ?? { count: 0, value: 0 };
      map.set(imp.supplier_id, {
        count: current.count + 1,
        value: current.value + (imp.total_landed_cost ?? imp.base_amount ?? 0),
      });
    }
    return map;
  }, [imports]);

  const paymentsBySupplier = useMemo(() => {
    const map = new Map<string, number>();
    for (const payment of payments) {
      if (!payment.supplier_id) continue;
      map.set(payment.supplier_id, (map.get(payment.supplier_id) ?? 0) + payment.amount);
    }
    return map;
  }, [payments]);

  const supplierSummaries = useMemo((): SupplierSummary[] => {
    return suppliers.map(supplier => {
      const supplierOrders = ordersBySupplier.get(supplier.id) ?? [];
      const supplierImports = importsBySupplier.get(supplier.id) ?? { count: 0, value: 0 };

      const orderValue = supplierOrders.reduce((sum, o) => {
        return sum + ((o.procurement_rate || 0) * (o.quantity || 1));
      }, 0);

      const totalProcurementValue = orderValue + supplierImports.value;
      const totalPaid = paymentsBySupplier.get(supplier.id) ?? 0;

      return {
        supplier,
        totalOrders: supplierOrders.length,
        totalImports: supplierImports.count,
        totalProcurementValue,
        totalPaid,
        pendingAmount: totalProcurementValue - totalPaid,
      };
    });
  }, [suppliers, ordersBySupplier, importsBySupplier, paymentsBySupplier]);

  const filteredSummaries = useMemo(() => {
    return supplierSummaries.filter(summary => 
      (summary.supplier.name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (summary.supplier.contact_name?.toLowerCase().includes(search.toLowerCase()) ?? false)
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

  const handleExportExcel = () => {
    const exportData: SupplierLedgerExportData[] = filteredSummaries.map(s => ({
      supplierName: s.supplier.name,
      contactName: s.supplier.contact_name,
      category: s.supplier.product_category,
      totalOrders: s.totalOrders,
      procurementValue: s.totalProcurementValue,
      paidAmount: s.totalPaid,
      pendingAmount: s.pendingAmount,
    }));

    exportSupplierLedgerToExcel(exportData, {
      filename: `supplier-ledger-${format(new Date(), 'yyyy-MM-dd')}`,
      title: "Supplier Ledger Report",
    });
    toast.success("Excel exported successfully");
  };

  const handleExportPDF = () => {
    const exportData: SupplierLedgerExportData[] = filteredSummaries.map(s => ({
      supplierName: s.supplier.name,
      contactName: s.supplier.contact_name,
      category: s.supplier.product_category,
      totalOrders: s.totalOrders,
      procurementValue: s.totalProcurementValue,
      paidAmount: s.totalPaid,
      pendingAmount: s.pendingAmount,
    }));

    exportSupplierLedgerToPDF(exportData, {
      filename: `supplier-ledger-${format(new Date(), 'yyyy-MM-dd')}`,
      title: "Supplier Ledger Report",
      subtitle: `Generated on ${format(new Date(), 'dd MMM yyyy')}`,
    });
    toast.success("PDF exported successfully");
  };

  const loading = suppliersLoading || paymentsLoading || ordersLoading || importsLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">Loading ledger...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {unattributedOrders > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              {unattributedOrders} procurement {unattributedOrders === 1 ? 'order is' : 'orders are'} not
              attributed to any supplier ({formatINR(unattributedValue)})
            </p>
            <p className="text-muted-foreground">
              Their supplier name does not resolve to a supplier record, so this value is missing
              from every balance below. Assign a supplier from the Procurements tab to include them.
            </p>
          </div>
        </div>
      )}

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
                <p className="text-2xl font-bold">{formatINR(totals.procurement)}</p>
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
                <p className="text-2xl font-bold text-green-600">{formatINR(totals.paid)}</p>
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
                <p className="text-2xl font-bold text-red-600">{formatINR(totals.pending)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ledger Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Supplier Ledger
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="w-4 h-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportExcel} className="gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Export to Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPDF} className="gap-2">
                <FileText className="w-4 h-4" />
                Export to PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
                  filteredSummaries.map(({ supplier, totalOrders, totalImports, totalProcurementValue, totalPaid, pendingAmount }) => (
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
                        <div className="flex items-center justify-center gap-1">
                          <Badge variant="secondary">{totalOrders}</Badge>
                          {totalImports > 0 && (
                            <Badge variant="outline" title={`${totalImports} import(s), valued at landed cost`}>
                              +{totalImports} imp
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatINR(totalProcurementValue)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {formatINR(totalPaid)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={pendingAmount > 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                          {formatINR(pendingAmount)}
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
