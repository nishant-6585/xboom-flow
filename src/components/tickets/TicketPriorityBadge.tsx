import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle, Minus, ArrowDown } from "lucide-react";
import { Database } from "@/integrations/supabase/types";

type TicketPriority = Database["public"]["Enums"]["ticket_priority"];

interface TicketPriorityBadgeProps {
  priority: TicketPriority;
}

const priorityConfig: Record<TicketPriority, { label: string; icon: typeof AlertTriangle; className: string }> = {
  critical: { label: "Critical", icon: AlertTriangle, className: "bg-red-500/20 text-red-600 border-red-500/50" },
  high: { label: "High", icon: AlertCircle, className: "bg-orange-500/20 text-orange-600 border-orange-500/50" },
  medium: { label: "Medium", icon: Minus, className: "bg-yellow-500/20 text-yellow-600 border-yellow-500/50" },
  low: { label: "Low", icon: ArrowDown, className: "bg-green-500/20 text-green-600 border-green-500/50" },
};

export function TicketPriorityBadge({ priority }: TicketPriorityBadgeProps) {
  const config = priorityConfig[priority];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={config.className}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </Badge>
  );
}
