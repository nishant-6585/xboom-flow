import { ProductQuery } from "@/types/query";
import { getSlaStatus, getTimeRemaining, UrgencyLevel } from "@/lib/sla";
import { Clock, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlaIndicatorProps {
  query: ProductQuery;
  showTime?: boolean;
}

export function SlaIndicator({ query, showTime = true }: SlaIndicatorProps) {
  const isResponded = query.status !== "pending";
  const respondedAt = isResponded ? query.updatedAt : null;
  
  const slaStatus = getSlaStatus(query.createdAt, respondedAt, query.urgency, isResponded);
  const timeRemaining = getTimeRemaining(query.createdAt, query.urgency);

  const statusConfig = {
    on_track: {
      icon: Clock,
      label: "On Track",
      className: "text-success bg-success/10",
    },
    at_risk: {
      icon: AlertTriangle,
      label: "At Risk",
      className: "text-warning bg-warning/10",
    },
    breached: {
      icon: XCircle,
      label: "SLA Breached",
      className: "text-destructive bg-destructive/10",
    },
    met: {
      icon: CheckCircle2,
      label: "SLA Met",
      className: "text-success bg-success/10",
    },
    delayed: {
      icon: XCircle,
      label: "Delayed",
      className: "text-destructive bg-destructive/10",
    },
  };

  const config = statusConfig[slaStatus];
  const Icon = config.icon;

  const formatTime = () => {
    if (slaStatus === "met" || slaStatus === "delayed") {
      return null;
    }
    
    const { hours, minutes, isOverdue } = timeRemaining;
    if (isOverdue) {
      return `${hours}h ${minutes}m overdue`;
    }
    return `${hours}h ${minutes}m left`;
  };

  return (
    <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium", config.className)}>
      <Icon className="w-3 h-3" />
      <span>{config.label}</span>
      {showTime && formatTime() && (
        <span className="opacity-75">({formatTime()})</span>
      )}
    </div>
  );
}