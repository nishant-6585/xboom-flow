import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { BuybackStatsCards } from "@/components/buyback/BuybackStatsCards";
import { BuybackFormDialog } from "@/components/buyback/BuybackFormDialog";
import { ResaleFormDialog } from "@/components/buyback/ResaleFormDialog";
import { RentDroneFormDialog } from "@/components/buyback/RentDroneFormDialog";
import { BuybackDroneTable } from "@/components/buyback/BuybackDroneTable";
import { useBuybackDrones } from "@/hooks/useBuybackDrones";
import { Skeleton } from "@/components/ui/skeleton";
import { WebsiteEnquiriesTable } from "@/components/WebsiteEnquiriesTable";
import { EmptyState, DataErrorState } from "@/components/data-states";
import { useTableExport } from "@/hooks/useTableExport";
import { Download, Package } from "lucide-react";

export default function Buyback() {
  const { dronesQuery } = useBuybackDrones();
  const drones = dronesQuery.data ?? [];
  const inStockDrones = drones.filter((d) => d.stock_status === "In Stock");
  const { exportToExcel } = useTableExport();

  const handleExport = () => {
    exportToExcel(drones as unknown as Record<string, unknown>[], "buyback-drones", {
      sheetName: "Buyback",
    });
  };

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Header />
      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Buyback & Resale</h1>
            <p className="text-muted-foreground text-sm">Track drone buybacks, inventory, and resale lifecycle</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport} disabled={drones.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <BuybackFormDialog />
            <RentDroneFormDialog inStockDrones={inStockDrones} />
            <ResaleFormDialog inStockDrones={inStockDrones} />
          </div>
        </div>

        {dronesQuery.isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-64" />
          </div>
        ) : dronesQuery.isError ? (
          <DataErrorState
            message={dronesQuery.error instanceof Error ? dronesQuery.error.message : undefined}
            onRetry={() => dronesQuery.refetch()}
          />
        ) : drones.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No buyback drones yet"
            description="Log a buyback to start tracking inventory and resale margins."
          />
        ) : (
          <>
            <BuybackStatsCards drones={drones} />
            <BuybackDroneTable drones={drones} />
          </>
        )}

        <WebsiteEnquiriesTable
          urlPattern="sell-your-used-drones"
          title="Sell-Your-Used-Drone Enquiries"
          description="Customer buyback enquiries from /sell-your-used-drones/"
        />
      </main>
      <MobileBottomNav />
    </div>
  );
}
