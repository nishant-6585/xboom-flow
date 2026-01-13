import { ProductQuery } from "@/types/query";
import { Card, CardContent } from "@/components/ui/card";
import { Send, CheckCircle2, Clock, ShoppingCart } from "lucide-react";

interface SalesStatsCardsProps {
  queries: ProductQuery[];
}

export function SalesStatsCards({ queries }: SalesStatsCardsProps) {
  const stats = {
    total: queries.length,
    pending: queries.filter((q) => q.status === "pending" || q.status === "on_hold").length,
    responded: queries.filter((q) => q.status === "responded" || q.status === "moved_to_pipeline" || q.status === "order_won" || q.status === "order_lost").length,
    won: queries.filter((q) => q.status === "order_won").length,
  };

  const responseRate = stats.total > 0 
    ? Math.round((stats.responded / stats.total) * 100) 
    : 0;

  const cards = [
    {
      label: "My Total Enquiries",
      value: stats.total,
      icon: Send,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Awaiting Response",
      value: stats.pending,
      icon: Clock,
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "Responded",
      value: stats.responded,
      icon: CheckCircle2,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Orders Won",
      value: stats.won,
      icon: ShoppingCart,
      color: "text-accent-foreground",
      bg: "bg-accent",
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">My Enquiries Performance</h3>
        <div className="text-sm text-muted-foreground">
          Response Rate: <span className="font-bold text-foreground">{responseRate}%</span>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.label} className="glass">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-2xl font-bold mt-1">{card.value}</p>
                </div>
                <div className={`p-3 rounded-lg ${card.bg}`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}