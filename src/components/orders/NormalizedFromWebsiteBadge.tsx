import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Small, self-contained badge shown on OrderDialog for Woo-linked orders
 * (external_id present) whose source has been normalized off 'website'.
 * Extracted so we can unit-test the timestamp/actor rendering and its
 * keyboard-accessible tooltip without booting the giant OrderDialog.
 */
export interface NormalizedFromWebsiteBadgeProps {
  attributedAt?: string | null;
  attributedByName?: string | null;
}

export function NormalizedFromWebsiteBadge({
  attributedAt,
  attributedByName,
}: NormalizedFromWebsiteBadgeProps) {
  const at = attributedAt
    ? new Date(attributedAt).toLocaleString('en-IN')
    : 'unknown time';
  const by = attributedByName || 'system';
  const tipText = `Normalized from WooCommerce (Vishal) — ${at} by ${by}. Direct salesperson edits are locked; use the Sales attribution panel to change credit.`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            tabIndex={0}
            role="button"
            variant="outline"
            data-testid="normalized-from-website-badge"
            className="text-[10px] h-5 px-1.5 text-amber-700 dark:text-amber-400 border-amber-500/40 bg-amber-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
            aria-label={tipText}
          >
            Normalized from website
            {attributedAt ? (
              <span className="ml-1 opacity-80" data-testid="normalized-from-website-date">
                · {new Date(attributedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </span>
            ) : null}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {tipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}