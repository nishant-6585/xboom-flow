import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, CalendarClock } from "lucide-react";
import { useRentals } from "@/hooks/useRentals";
import { useBuybackDrones } from "@/hooks/useBuybackDrones";
import { RentalStatsCards } from "@/components/rent/RentalStatsCards";
import { RentalsTable } from "@/components/rent/RentalsTable";
import { RentDroneFormDialog } from "@/components/buyback/RentDroneFormDialog";
import { BuybackStatsCards } from "@/components/buyback/BuybackStatsCards";
import { EmptyState, DataErrorState } from "@/components/data-states";
import { useTableExport } from "@/hooks/useTableExport";
import { WebsiteEnquiriesTable } from "@/components/WebsiteEnquiriesTable";

export default function Rent() {
  const { rentalsQuery } = useRentals();
  const { dronesQuery } = useBuybackDrones();
  const rentals = rentalsQuery.data ?? [];
  const drones = dronesQuery.data ?? [];
  const inStockDrones = drones.filter((d) => d.stock_status === "In Stock");
  const { exportToExcel } = useTableExport();

  const handleExport = () => {
    const flat = rentals.map((r) => ({
      drone_model: r.drone?.drone_model,
      serial_number: r.drone?.serial_number,
      renter_name: r.renter_name,
      renter_contact: r.renter_contact,
      rental_start_date: r.rental_start_date,
      expected_return_date: r.expected_return_date,
      actual_return_date: r.actual_return_date,
      rental_fee: r.rental_fee,
      security_deposit: r.security_deposit,
      status: r.status,
    }));
    exportToExcel(flat as unknown as Record<string, unknown>[], "drone-rentals", { sheetName: "Rentals" });
  };

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Header />
      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Drone Rentals</h1>
            <p className="text-muted-foreground text-sm">Track which drones are on rent and rental lifecycle</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport} disabled={rentals.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <RentDroneFormDialog inStockDrones={inStockDrones} />
          </div>
        </div>

        {rentalsQuery.isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-64" />
          </div>
        ) : rentalsQuery.isError ? (
          <DataErrorState
            message={rentalsQuery.error instanceof Error ? rentalsQuery.error.message : undefined}
            onRetry={() => rentalsQuery.refetch()}
          />
        ) : (
          <>
            <BuybackStatsCards drones={drones} />
            <RentalStatsCards rentals={rentals} />
            {rentals.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="No rentals yet"
                description="Put a buyback drone on rent to start tracking rentals here."
              />
            ) : (
              <RentalsTable rentals={rentals} />
            )}
          </>
        )}

        <WebsiteEnquiriesTable
          urlPattern="rent-a-drone"
          title="Rent-a-Drone Enquiries"
          description="Form submissions from /rent-a-drone/"
        />
      </main>
      <MobileBottomNav />
    </div>
  );
}
