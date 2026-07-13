import { useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package } from 'lucide-react';

interface Props {
  /** Called when the user activates the "View all orders" fallback. */
  onViewAll: () => void;
  /** Autofocus the fallback CTA on mount (defaults to true). */
  autoFocusCta?: boolean;
}

/**
 * Empty-state shown on the "WooCommerce (Vishal)" (source=website_auto)
 * filter when there are zero unattributed system-user orders.
 *
 * Accessibility notes:
 *  - Rendered as a labelled region (role="region", aria-labelledby)
 *    so screen readers announce it as a discrete landmark.
 *  - role="status" + aria-live="polite" so the "no results" state is
 *    announced when it appears mid-session (e.g. after a rep claims
 *    the last unattributed order).
 *  - The fallback CTA is focused on mount so keyboard users land
 *    directly on the next actionable control, and it is reachable
 *    with Tab / activated with Enter or Space (native <button>).
 */
export function WebsiteAutoEmptyState({ onViewAll, autoFocusCta = true }: Props) {
  const headingId = 'website-auto-empty-heading';
  const descriptionId = 'website-auto-empty-description';
  const ctaRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (autoFocusCta) ctaRef.current?.focus();
  }, [autoFocusCta]);

  return (
    <Card
      data-testid="website-auto-empty-state"
      role="region"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      className="border-dashed border-2 bg-gradient-to-br from-emerald-50/60 to-transparent dark:from-emerald-950/20"
    >
      <CardContent
        role="status"
        aria-live="polite"
        className="flex flex-col items-center justify-center py-20 text-center"
      >
        <div
          className="p-6 rounded-2xl bg-emerald-100/70 dark:bg-emerald-900/30 mb-6 shadow-inner"
          aria-hidden="true"
        >
          <Package className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h3 id={headingId} className="text-xl font-semibold mb-2">
          All WooCommerce (Vishal) orders are attributed
        </h3>
        <p id={descriptionId} className="text-muted-foreground max-w-lg leading-relaxed">
          This view lists paid WooCommerce orders that are still assigned to
          the system ingestion user ("Vishal (Website)") and waiting to be
          claimed by a rep. Right now there are none — every incoming Woo
          order has already been credited to a salesperson.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="rounded-full">
            Auto-refreshes as new Woo orders arrive
          </Badge>
          <Badge variant="outline" className="rounded-full">
            Managers can re-assign from any order dialog
          </Badge>
        </div>
        <Button
          ref={ctaRef}
          variant="outline"
          onClick={onViewAll}
          aria-label="View all orders across every source"
          className="mt-6 gap-2 rounded-xl h-11 px-6 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          View all orders
        </Button>
      </CardContent>
    </Card>
  );
}