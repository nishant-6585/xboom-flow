import { Badge } from "@/components/ui/badge";
import { QueryStatus } from "@/types/query";

interface StatusBadgeProps {
  status: QueryStatus;
}

const statusConfig: Record<QueryStatus, { label: string; variant: "pending" | "review" | "confirmed" | "rejected" }> = {
  pending: { label: "Pending", variant: "pending" },
  in_review: { label: "In Review", variant: "review" },
  confirmed: { label: "Confirmed", variant: "confirmed" },
  rejected: { label: "Rejected", variant: "rejected" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  );
}
