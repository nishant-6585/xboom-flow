import { Globe } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAnalyticsScope } from "@/contexts/AnalyticsScopeContext";

interface Props {
  className?: string;
  /** Compact label-less variant */
  compact?: boolean;
}

/**
 * Toggle that controls whether website (WooCommerce) orders are included
 * in analytics, dashboards, leaderboards and gamification.
 * Default OFF — sales analytics show only manual/internal orders.
 */
export function IncludeWebsiteToggle({ className, compact }: Props) {
  const { includeWebsite, setIncludeWebsite } = useAnalyticsScope();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`flex items-center gap-2 rounded-md border border-border/50 bg-background/50 px-3 py-1.5 ${className ?? ""}`}
        >
          <Globe className="w-3.5 h-3.5 text-muted-foreground" />
          {!compact && (
            <Label htmlFor="include-website-toggle" className="text-xs cursor-pointer whitespace-nowrap">
              Include website orders
            </Label>
          )}
          <Switch
            id="include-website-toggle"
            checked={includeWebsite}
            onCheckedChange={setIncludeWebsite}
            className="scale-75"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <p className="text-xs">
          {includeWebsite
            ? "Including WooCommerce/website orders in analytics."
            : "Excluding WooCommerce/website orders from analytics by default. Toggle on to include them."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}