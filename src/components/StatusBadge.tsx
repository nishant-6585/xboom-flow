import { Badge } from "@/components/ui/badge";
import { QueryStatus } from "@/types/query";

interface StatusBadgeProps {
  status: QueryStatus;
}

const statusConfig: Record<QueryStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  responded: { label: "Responded", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  follow_up: { label: "Follow-up Pending", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  on_hold: { label: "On Hold", className: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  moved_to_pipeline: { label: "In Pipeline", className: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  order_won: { label: "Order Won", className: "bg-green-500/10 text-green-600 border-green-500/20" },
  order_lost: { label: "Order Lost", className: "bg-red-500/10 text-red-600 border-red-500/20" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, className: "bg-muted text-muted-foreground" };
  
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}