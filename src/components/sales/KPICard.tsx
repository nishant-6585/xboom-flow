import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const ZERO_VALUES = new Set(["0", "0%", "₹0", "0.0", "₹0.0", "₹0.00"]);

export function isZeroValue(value: number | string) {
  if (typeof value === "number") return value === 0;
  return ZERO_VALUES.has(String(value).trim());
}

export interface KPICardProps {
  label: string;
  value: number | string;
  icon: any;
  /** Retained for call-site compatibility — intentionally not rendered. */
  gradient?: string;
  subText?: string;
  isText?: boolean;
  onClick?: () => void;
  tier?: "primary" | "secondary";
}

/**
 * Shared drill-down KPI tile used by the Sales Command Center and the
 * Enquiries dashboard. Neutral surface, muted zeros, visible affordance.
 */
export function KPICard({
  label,
  value,
  icon: Icon,
  subText,
  isText,
  onClick,
  tier = "primary",
}: KPICardProps) {
  const zero = isZeroValue(value);
  const display = isText ? value : typeof value === "number" ? value.toLocaleString() : value;
  const secondary = tier === "secondary";

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        "group relative bg-card border border-border rounded-xl",
        secondary ? "p-3 bg-muted/40" : "p-4",
        onClick &&
          "cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </span>
        <Icon className={cn("w-4 h-4 shrink-0", zero ? "text-muted-foreground/50" : "text-muted-foreground")} />
      </div>

      <p
        className={cn(
          "mt-2 font-semibold tabular-nums tracking-tight",
          secondary ? "text-xl" : "text-[34px] leading-none",
          zero && "text-muted-foreground",
        )}
      >
        {display}
      </p>

      {subText && <p className="text-xs text-muted-foreground mt-1">{subText}</p>}

      {onClick && (
        <ChevronRight className="absolute top-2 right-2 w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </div>
  );
}

export default KPICard;