import { Check, Circle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CUSTOMER_TIMELINE,
  STATE_DESCRIPTIONS,
  STATE_LABELS,
  timelineProgress,
  type PortalOrderState,
} from "@/portal/lib/orderStates";
import type { PortalStateTransition } from "@/portal/hooks/usePortalOrders";

interface Props {
  currentState: PortalOrderState;
  transitions: PortalStateTransition[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrderTimeline({ currentState, transitions }: Props) {
  if (currentState === "cancelled") {
    const last = transitions[transitions.length - 1];
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
          <X className="h-4 w-4 text-destructive" />
        </div>
        <div>
          <div className="font-medium text-destructive">Order cancelled</div>
          {last?.customer_facing_note && (
            <p className="text-sm text-muted-foreground mt-1">{last.customer_facing_note}</p>
          )}
          {last?.transitioned_at && (
            <p className="text-xs text-muted-foreground mt-1">{formatDate(last.transitioned_at)}</p>
          )}
        </div>
      </div>
    );
  }

  const activeIdx = timelineProgress(currentState);

  // Map latest transition per to_state for timestamps + customer notes
  const transitionByState = new Map<PortalOrderState, PortalStateTransition>();
  for (const t of transitions) transitionByState.set(t.to_state, t);

  return (
    <ol className="relative border-l-2 border-muted pl-6 space-y-6">
      {CUSTOMER_TIMELINE.map((step, idx) => {
        const reached = idx <= activeIdx;
        const isCurrent = idx === activeIdx;
        const transition = transitionByState.get(step);
        return (
          <li key={step} className="relative">
            <span
              className={cn(
                "absolute -left-[34px] top-0 h-7 w-7 rounded-full flex items-center justify-center border-2",
                reached
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-background border-muted text-muted-foreground",
                isCurrent && "ring-4 ring-primary/20",
              )}
            >
              {reached ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-2 w-2 fill-current" />}
            </span>
            <div className={cn("text-sm font-medium", reached ? "text-foreground" : "text-muted-foreground")}>
              {STATE_LABELS[step]}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{STATE_DESCRIPTIONS[step]}</p>
            {transition && (
              <div className="mt-1 text-xs text-muted-foreground">
                <span>{formatDate(transition.transitioned_at)}</span>
                {transition.customer_facing_note && (
                  <p className="mt-1 text-foreground/80 italic">"{transition.customer_facing_note}"</p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}