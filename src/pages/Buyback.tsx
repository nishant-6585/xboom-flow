import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { BuybackStatsCards } from "@/components/buyback/BuybackStatsCards";
import { BuybackFormDialog } from "@/components/buyback/BuybackFormDialog";
import { ResaleFormDialog } from "@/components/buyback/ResaleFormDialog";
import { BuybackDroneTable } from "@/components/buyback/BuybackDroneTable";
import { useBuybackDrones } from "@/hooks/useBuybackDrones";
import { Skeleton } from "@/components/ui/skeleton";
import { WebsiteEnquiriesTable } from "@/components/WebsiteEnquiriesTable";

export default function Buyback() {
  const { dronesQuery } = useBuybackDrones();
  const drones = dronesQuery.data ?? [];
  const inStockDrones = drones.filter((d) => d.stock_status === "In Stock");

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
            <BuybackFormDialog />
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
