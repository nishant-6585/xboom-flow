import { QueryStatus } from "@/hooks/useEnquiries";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, CheckCircle2, Trophy, XCircle, Pause, ArrowRightCircle, MessageCircleWarning } from "lucide-react";

interface ProductQuery {
  id: string;
  status: QueryStatus;
}

interface StatsCardsProps {
  queries: ProductQuery[];
  onStatusClick?: (status: QueryStatus | "all") => void;
}

export function StatsCards({ queries, onStatusClick }: StatsCardsProps) {
  const stats = {
    pending: queries.filter((q) => q.status === "pending").length,
    responded: queries.filter((q) => q.status === "responded").length,
    follow_up: queries.filter((q) => q.status === "follow_up").length,
    on_hold: queries.filter((q) => q.status === "on_hold").length,
    moved_to_pipeline: queries.filter((q) => q.status === "moved_to_pipeline").length,
    won: queries.filter((q) => q.status === "order_won").length,
    lost: queries.filter((q) => q.status === "order_lost").length,
  };

  const cards: {
    label: string;
    value: number;
    icon: typeof Clock;
    color: string;
    bg: string;
    status: QueryStatus;
  }[] = [
    {
      label: "Pending",
      value: stats.pending,
      icon: Clock,
      color: "text-warning",
      bg: "bg-warning/10",
      status: "pending",
    },
    {
      label: "Responded",
      value: stats.responded,
      icon: CheckCircle2,
      color: "text-primary",
      bg: "bg-primary/10",
      status: "responded",
    },
    {
      label: "Follow-up Pending",
      value: stats.follow_up,
      icon: MessageCircleWarning,
      color: "text-amber-600",
      bg: "bg-amber-500/10",
      status: "follow_up",
    },
    {
      label: "On Hold",
      value: stats.on_hold,
      icon: Pause,
      color: "text-muted-foreground",
      bg: "bg-muted",
      status: "on_hold",
    },
    {
      label: "Pipeline",
      value: stats.moved_to_pipeline,
      icon: ArrowRightCircle,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      status: "moved_to_pipeline",
    },
    {
      label: "Order Won",
      value: stats.won,
      icon: Trophy,
      color: "text-success",
      bg: "bg-success/10",
      status: "order_won",
    },
    {
      label: "Order Lost",
      value: stats.lost,
      icon: XCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
      status: "order_lost",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 animate-fade-in">
      {cards.map((card) => (
        <Card 
          key={card.label} 
          className={`glass cursor-pointer transition-all hover:scale-105 hover:shadow-lg ${onStatusClick ? 'hover:ring-2 hover:ring-primary/50' : ''}`}
          onClick={() => onStatusClick?.(card.status)}
        >
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