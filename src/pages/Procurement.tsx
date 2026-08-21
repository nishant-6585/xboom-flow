import { useState } from "react";
import { Header } from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { ProcurementOrders } from "@/components/procurement/ProcurementOrders";
import { ProcurementLedger } from "@/components/procurement/ProcurementLedger";
import { ProcurementDashboard } from "@/components/procurement/ProcurementDashboard";
import { PendingPaymentStatusRequests } from "@/components/procurement/PendingPaymentStatusRequests";
import { SupplierPaymentAnalytics } from "@/components/procurement/SupplierPaymentAnalytics";
import { InventoryProcurementsList } from "@/components/procurement/InventoryProcurementsList";
import { MultiProductProcurementForm } from "@/components/procurement/MultiProductProcurementForm";
import { OrderProcurementTracker } from "@/components/procurement/OrderProcurementTracker";
import { ImportsList } from "@/components/imports/ImportsList";
import { GoodsReceiptPanel } from "@/components/procurement/GoodsReceiptPanel";
import { FileText, BookOpen, LayoutDashboard, CreditCard, IndianRupee, Package, Plus, Link2, Ship, ClipboardCheck } from "lucide-react";
import { useProcurementPaymentRequests } from "@/hooks/useProcurementPaymentRequests";
import { Badge } from "@/components/ui/badge";

export default function Procurement() {
  const { role, loading: authLoading } = useAuth();
  const { getPendingCount } = useProcurementPaymentRequests();
  const [activeTab, setActiveTab] = useState("orders");
  const [manualProcurementOpen, setManualProcurementOpen] = useState(false);
  const pendingCount = getPendingCount();

  if (authLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Only admin, supply_chain, and finance can access procurement
  if (role !== "admin" && role !== "supply_chain" && role !== "finance") {
    return <Navigate to="/" replace />;
  }

  // Finance role has view-only access (no manual procurement creation)
  const canCreate = role === "admin" || role === "supply_chain" || role === "finance";

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Header />
      <main className="container mx-auto px-4 py-4 sm:py-6 flex-1 overflow-x-hidden">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Procurement Management</h1>
            <p className="text-muted-foreground">
              Manage procurement orders, supplier payments and view analytics
            </p>
          </div>
          {canCreate && (
            <Button onClick={() => setManualProcurementOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Manual Procurement
            </Button>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex w-full overflow-x-auto gap-1 h-auto flex-nowrap justify-start">
            <TabsTrigger value="orders" className="gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Procurements</span>
            </TabsTrigger>
            <TabsTrigger value="imports" className="gap-2">
              <Ship className="w-4 h-4" />
              <span className="hidden sm:inline">Imports</span>
            </TabsTrigger>
            <TabsTrigger value="receiving" className="gap-2">
              <ClipboardCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Receiving</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" className="gap-2">
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Inventory</span>
            </TabsTrigger>
            <TabsTrigger value="tracker" className="gap-2">
              <Link2 className="w-4 h-4" />
              <span className="hidden sm:inline">Tracker</span>
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-2 relative">
              <CreditCard className="w-4 h-4" />
              <span className="hidden sm:inline">Requests</span>
              {(role === 'admin' || role === 'finance') && pendingCount > 0 && (
                <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="ledger" className="gap-2">
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Ledger</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-2">
              <IndianRupee className="w-4 h-4" />
              <span className="hidden sm:inline">Payments</span>
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-2">
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="mt-6" forceMount>
            <div className={activeTab !== "orders" ? "hidden" : undefined}>
              <ProcurementOrders />
            </div>
          </TabsContent>

          <TabsContent value="imports" className="mt-6" forceMount>
            <div className={activeTab !== "imports" ? "hidden" : undefined}>
              <ImportsList />
            </div>
          </TabsContent>

          {/* Not forceMount: the match view is a heavier query and only matters
              when someone is actually receiving. */}
          <TabsContent value="receiving" className="mt-6">
            <GoodsReceiptPanel />
          </TabsContent>

          <TabsContent value="inventory" className="mt-6" forceMount>
            <div className={activeTab !== "inventory" ? "hidden" : undefined}>
              <InventoryProcurementsList />
            </div>
          </TabsContent>

          <TabsContent value="tracker" className="mt-6" forceMount>
            <div className={activeTab !== "tracker" ? "hidden" : undefined}>
              <OrderProcurementTracker />
            </div>
          </TabsContent>

          <TabsContent value="requests" className="mt-6" forceMount>
            <div className={activeTab !== "requests" ? "hidden" : undefined}>
              <PendingPaymentStatusRequests />
            </div>
          </TabsContent>

          <TabsContent value="ledger" className="mt-6" forceMount>
            <div className={activeTab !== "ledger" ? "hidden" : undefined}>
              <ProcurementLedger />
            </div>
          </TabsContent>

          <TabsContent value="payments" className="mt-6" forceMount>
            <div className={activeTab !== "payments" ? "hidden" : undefined}>
              <SupplierPaymentAnalytics />
            </div>
          </TabsContent>

          <TabsContent value="dashboard" className="mt-6" forceMount>
            <div className={activeTab !== "dashboard" ? "hidden" : undefined}>
              <ProcurementDashboard />
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <MultiProductProcurementForm
        open={manualProcurementOpen}
        onOpenChange={setManualProcurementOpen}
      />
    </div>
  );
}
