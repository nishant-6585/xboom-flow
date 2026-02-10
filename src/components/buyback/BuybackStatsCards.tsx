import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, ShoppingCart, TrendingUp, TrendingDown } from "lucide-react";
import { BuybackDrone } from "@/hooks/useBuybackDrones";

interface Props {
  drones: BuybackDrone[];
}

export function BuybackStatsCards({ drones }: Props) {
  const inStock = drones.filter((d) => d.stock_status === "In Stock").length;
  const sold = drones.filter((d) => d.stock_status === "Sold Out").length;
  const totalProfit = drones
    .filter((d) => d.profit_loss !== null)
    .reduce((sum, d) => sum + (d.profit_loss ?? 0), 0);

  const stats = [
    {
      title: "Total Drones",
      value: drones.length,
      icon: Package,
      color: "text-blue-600",
      bg: "bg-blue-500/10",
    },
    {
      title: "In Stock",
      value: inStock,
      icon: Package,
      color: "text-green-600",
      bg: "bg-green-500/10",
    },
    {
      title: "Sold Out",
      value: sold,
      icon: ShoppingCart,
      color: "text-orange-600",
      bg: "bg-orange-500/10",
    },
    {
      title: "Total Profit / Loss",
      value: `₹${totalProfit.toLocaleString("en-IN")}`,
      icon: totalProfit >= 0 ? TrendingUp : TrendingDown,
      color: totalProfit >= 0 ? "text-green-600" : "text-red-600",
      bg: totalProfit >= 0 ? "bg-green-500/10" : "bg-red-500/10",
    },
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
