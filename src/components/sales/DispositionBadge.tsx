import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  getDispositionBadgeClass,
  getDispositionLabel,
  getReasonLabel,
  type LeadDisposition,
} from "@/lib/leadDispositions";

export interface DispositionBadgeProps {
  disposition?: LeadDisposition | string | null;
  reasonCode?: string | null;
  reasonNote?: string | null;
  dispositionAt?: string | null;
  dispositionByName?: string | null;
  /** Hide entirely when disposition is untouched (default true). */
  hideUntouched?: boolean;
  className?: string;
}

export function DispositionBadge({
  disposition,
  reasonCode,
  reasonNote,
  dispositionAt,
  dispositionByName,
  hideUntouched = true,
  className,
}: DispositionBadgeProps) {
  const d = (disposition ?? "untouched") as LeadDisposition;
  if (hideUntouched && (d === "untouched" || !d)) return null;

  const isTerminal = d === "qualified" || d === "not_qualified";
  const reasonLabel = isTerminal ? getReasonLabel(d, reasonCode ?? null) : null;

  const when = dispositionAt ? format(new Date(dispositionAt), "PP p") : null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0 h-5 font-medium cursor-default",
              getDispositionBadgeClass(d),
              className,
            )}
          >
            {getDispositionLabel(d)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs space-y-1">
          <div className="text-xs font-semibold">{getDispositionLabel(d)}</div>
          {reasonLabel && (
            <div className="text-xs">
              <span className="text-muted-foreground">Reason: </span>
              {reasonLabel}
            </div>
          )}
          {reasonNote && (
            <div className="text-xs italic text-muted-foreground">"{reasonNote}"</div>
          )}
          {(dispositionByName || when) && (
            <div className="text-[10px] text-muted-foreground pt-1 border-t">
              {dispositionByName ? `By ${dispositionByName}` : "By —"}
              {when ? ` · ${when}` : ""}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}