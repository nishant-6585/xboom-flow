import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { WebsiteEnquiriesTable } from "@/components/WebsiteEnquiriesTable";

export default function Rent() {
  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Header />
      <main className="container mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Drone Rentals</h1>
          <p className="text-muted-foreground text-sm">
            Customer enquiries from the website rent-a-drone page
          </p>
        </div>
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
