import { cn } from "@/lib/utils";
import type { TicketStatus, TicketPriority } from "@/portal/hooks/usePortalTickets";

const STATUS: Record<TicketStatus, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-blue-100 text-blue-800" },
  in_progress: { label: "In progress", cls: "bg-amber-100 text-amber-900" },
  awaiting_customer: { label: "Awaiting you", cls: "bg-orange-100 text-orange-900" },
  resolved: { label: "Resolved", cls: "bg-emerald-100 text-emerald-900" },
  closed: { label: "Closed", cls: "bg-muted text-muted-foreground" },
};

const PRIORITY: Record<TicketPriority, { label: string; cls: string }> = {
  low: { label: "Low", cls: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", cls: "bg-blue-50 text-blue-800" },
  high: { label: "High", cls: "bg-amber-50 text-amber-900" },
  critical: { label: "Critical", cls: "bg-red-100 text-red-900" },
};

export function TicketStatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  const s = STATUS[status];
  return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", s.cls, className)}>{s.label}</span>;
}

export function TicketPriorityBadge({ priority, className }: { priority: TicketPriority; className?: string }) {
  const p = PRIORITY[priority];
  return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", p.cls, className)}>{p.label}</span>;
}