import { cn } from "@/lib/utils";
import { STATE_LABELS, stateBadgeTone, type PortalOrderState } from "@/portal/lib/orderStates";

const TONE_CLASSES: Record<ReturnType<typeof stateBadgeTone>, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  success: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  danger: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

export function OrderStateBadge({ state, className }: { state: PortalOrderState; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[stateBadgeTone(state)],
        className,
      )}
    >
      {STATE_LABELS[state]}
    </span>
  );
}