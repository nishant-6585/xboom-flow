import { cn } from "@/lib/utils";
import { UrgencyLevel } from "@/types/query";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface UrgencyIndicatorProps {
  urgency: UrgencyLevel;
  showLabel?: boolean;
}

const urgencyConfig: Record<UrgencyLevel, { label: string; color: string }> = {
  low: { label: "Low", color: "bg-muted-foreground" },
  medium: { label: "Medium", color: "bg-primary" },
  high: { label: "High", color: "bg-warning" },
  critical: { label: "Critical", color: "bg-destructive" },
};

export function UrgencyIndicator({ urgency, showLabel = true }: UrgencyIndicatorProps) {
  const config = urgencyConfig[urgency];
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full", config.color)} />
          {showLabel && (
            <span className="text-sm text-muted-foreground">{config.label}</span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>Urgency: {config.label}</TooltipContent>
    </Tooltip>
  );
}
