import { useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  orderId: string;
  confirmationStatus?: string | null;
  requiresConfirmation?: boolean | null;
  confirmedAt?: string | null;
}

/**
 * Compact confirmation state chip for order cards.
 * - "Confirmation pending" (amber) when awaiting the customer
 * - "Confirmed" (green) once the customer has confirmed via the portal
 * - Nothing when confirmation is not required
 *
 * On tooltip open (confirmed state) it lazily fetches the confirming portal
 * contact via a staff-only RPC to show who/when.
 */
export function OrderConfirmationChip({
  orderId,
  confirmationStatus,
  requiresConfirmation,
  confirmedAt,
}: Props) {
  const status = confirmationStatus || (requiresConfirmation ? "pending" : "not_required");
  const [contact, setContact] = useState<{ name: string | null; email: string | null } | null>(null);
  const [loaded, setLoaded] = useState(false);

  if (status === "not_required" || (!requiresConfirmation && status !== "pending" && status !== "confirmed")) {
    return null;
  }

  const loadContact = async () => {
    if (loaded || status !== "confirmed") return;
    setLoaded(true);
    const { data, error } = await (supabase as any).rpc("get_order_confirmation_details", {
      p_order_id: orderId,
    });
    if (error) return;
    const row = Array.isArray(data) ? data[0] : data;
    if (row) setContact({ name: row.contact_name ?? null, email: row.contact_email ?? null });
  };

  const when = confirmedAt ? format(new Date(confirmedAt), "dd MMM yyyy, HH:mm") : null;
  const isConfirmed = status === "confirmed";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip onOpenChange={(open) => open && loadContact()}>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            onClick={(e) => e.stopPropagation()}
            className={
              isConfirmed
                ? "text-xs h-5 px-1.5 gap-1 whitespace-nowrap border-emerald-400 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400"
                : "text-xs h-5 px-1.5 gap-1 whitespace-nowrap border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400"
            }
          >
            {isConfirmed ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            {isConfirmed ? "Confirmed" : "Confirmation pending"}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {isConfirmed ? (
            <div className="space-y-0.5">
              <div>
                <span className="font-medium">By:</span>{" "}
                {contact?.name || contact?.email || (loaded ? "Customer" : "Loading…")}
              </div>
              {contact?.email && contact?.name && (
                <div className="opacity-80">{contact.email}</div>
              )}
              {when && (
                <div>
                  <span className="font-medium">When:</span> {when}
                </div>
              )}
            </div>
          ) : (
            <div>Awaiting customer confirmation via the portal.</div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}