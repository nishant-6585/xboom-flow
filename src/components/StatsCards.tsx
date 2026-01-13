import { ProductQuery } from "@/types/query";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, CheckCircle2, Trophy, XCircle } from "lucide-react";

interface StatsCardsProps {
  queries: ProductQuery[];
}

export function StatsCards({ queries }: StatsCardsProps) {
  const stats = {
    pending: queries.filter((q) => q.status === "pending").length,
    responded: queries.filter((q) => q.status === "responded").length,
    won: queries.filter((q) => q.status === "order_won").length,
    lost: queries.filter((q) => q.status === "order_lost").length,
  };

  const cards = [
    {
      label: "Pending",
      value: stats.pending,
      icon: Clock,
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "Responded",
      value: stats.responded,
      icon: CheckCircle2,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Order Won",
      value: stats.won,
      icon: Trophy,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Order Lost",
      value: stats.lost,
      icon: XCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in">
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
  );
}