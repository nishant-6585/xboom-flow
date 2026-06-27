import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarClock, CheckCircle2, IndianRupee, Package } from "lucide-react";
import { RentalRecord } from "@/hooks/useRentals";

interface Props {
  rentals: RentalRecord[];
}

export function RentalStatsCards({ rentals }: Props) {
  const active = rentals.filter((r) => r.status === "Active").length;
  const returned = rentals.filter((r) => r.status === "Returned").length;
  const revenue = rentals.reduce((sum, r) => sum + (Number(r.rental_fee) || 0), 0);

  const stats = [
    { title: "Total Rentals", value: rentals.length, icon: Package, color: "text-blue-600", bg: "bg-blue-500/10" },
    { title: "Currently On Rent", value: active, icon: CalendarClock, color: "text-orange-600", bg: "bg-orange-500/10" },
    { title: "Returned", value: returned, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-500/10" },
    { title: "Total Rental Revenue", value: `₹${revenue.toLocaleString("en-IN")}`, icon: IndianRupee, color: "text-green-600", bg: "bg-green-500/10" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <Card key={s.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{s.title}</CardTitle>
            <div className={`p-2 rounded-lg ${s.bg}`}>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{s.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
