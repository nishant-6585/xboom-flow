import { Badge } from "@/components/ui/badge";
import { Database } from "@/integrations/supabase/types";

type TicketStatus = Database["public"]["Enums"]["ticket_status"];

interface TicketStatusBadgeProps {
  status: TicketStatus;
}

const statusConfig: Record<TicketStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
  open: { label: "Open", variant: "default", className: "bg-blue-500 hover:bg-blue-500" },
  assigned: { label: "Assigned", variant: "default", className: "bg-purple-500 hover:bg-purple-500" },
  in_progress: { label: "In Progress", variant: "default", className: "bg-yellow-500 hover:bg-yellow-500 text-black" },
  pending: { label: "Pending", variant: "default", className: "bg-orange-500 hover:bg-orange-500" },
  resolved: { label: "Resolved", variant: "default", className: "bg-green-500 hover:bg-green-500" },
  closed: { label: "Closed", variant: "secondary", className: "bg-muted text-muted-foreground" },
  removed: { label: "Removed", variant: "destructive", className: "bg-destructive/80 hover:bg-destructive/80" },
};

export function TicketStatusBadge({ status }: TicketStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}
