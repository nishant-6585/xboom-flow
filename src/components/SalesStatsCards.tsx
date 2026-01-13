import { QueryStatus } from "@/hooks/useEnquiries";
import { Card, CardContent } from "@/components/ui/card";
import { Send, CheckCircle2, Clock, ShoppingCart } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ProductQuery {
  id: string;
  status: QueryStatus;
}

interface SalesStatsCardsProps {
  queries: ProductQuery[];
  onStatusClick?: (status: QueryStatus | "all") => void;
}

export function SalesStatsCards({ queries, onStatusClick }: SalesStatsCardsProps) {
  const stats = {
    total: queries.length,
    pending: queries.filter((q) => q.status === "pending" || q.status === "on_hold").length,
    responded: queries.filter((q) => q.status === "responded" || q.status === "moved_to_pipeline" || q.status === "order_won" || q.status === "order_lost").length,
    won: queries.filter((q) => q.status === "order_won").length,
  };

  const responseRate = stats.total > 0 
    ? Math.round((stats.responded / stats.total) * 100) 
    : 0;

  const cards: {
    label: string;
    value: number;
    icon: typeof Send;
    color: string;
    bg: string;
    clickAction: QueryStatus | "all";
    tooltip?: string;
  }[] = [
    {
      label: "My Total Enquiries",
      value: stats.total,
      icon: Send,
      color: "text-primary",
      bg: "bg-primary/10",
      clickAction: "all",
    },
    {
      label: "Awaiting Response",
      value: stats.pending,
      icon: Clock,
      color: "text-warning",
      bg: "bg-warning/10",
      clickAction: "pending",
    },
    {
      label: "Enquiry Processed",
      value: stats.responded,
      icon: CheckCircle2,
      color: "text-success",
      bg: "bg-success/10",
      clickAction: "responded",
      tooltip: "Includes Responded, Pipeline, Order Won, and Order Lost enquiries",
    },
    {
      label: "Orders Won",
      value: stats.won,
      icon: ShoppingCart,
      color: "text-accent-foreground",
      bg: "bg-accent",
      clickAction: "order_won",
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
        <TooltipProvider>
          {cards.map((card) => {
            const cardContent = (
              <Card 
                key={card.label} 
                className={`glass cursor-pointer transition-all hover:scale-105 hover:shadow-lg ${onStatusClick ? 'hover:ring-2 hover:ring-primary/50' : ''}`}
                onClick={() => onStatusClick?.(card.clickAction)}
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
            );

            if (card.tooltip) {
              return (
                <Tooltip key={card.label}>
                  <TooltipTrigger asChild>
                    {cardContent}
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{card.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              );
            }

            return cardContent;
          })}
        </TooltipProvider>
      </div>
    </div>
  );
}