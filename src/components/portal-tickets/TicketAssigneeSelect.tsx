import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserCheck, UserX } from "lucide-react";
import {
  usePortalTicketAssignees,
  useAssignPortalTicket,
} from "@/hooks/usePortalTicketAssignees";

/** Sentinel — Radix Select cannot hold an empty-string item value. */
const UNASSIGNED = "__unassigned__";

const ROLE_LABEL: Record<string, string> = {
  supply_chain: "Supply chain",
  support: "Support",
  sales_manager: "Sales manager",
  admin: "Admin",
};

interface Props {
  ticketId: string;
  assignedTo: string | null;
  /** Pre-resolved name from the inbox RPC — avoids a second lookup per row. */
  assignedToName?: string | null;
  size?: "sm" | "default";
  className?: string;
}

/**
 * Owner picker for a portal ticket — the same "assign it to a person" flow the
 * lead tables use, so an unattended ticket has someone's name on it.
 *
 * Assignment does not silence the team: supply chain is alerted on every
 * ticket regardless (see _shared/staff-routing.ts). The owner just gets a
 * direct nudge on top and shows up in the queue as accountable.
 */
export function TicketAssigneeSelect({
  ticketId,
  assignedTo,
  assignedToName,
  size = "sm",
  className,
}: Props) {
  const { assignees, isLoading } = usePortalTicketAssignees();
  const assign = useAssignPortalTicket();

  const current = assignedTo ?? UNASSIGNED;
  const currentName =
    assignedToName ??
    assignees.find((a) => a.user_id === assignedTo)?.name ??
    (assignedTo ? "Assigned" : null);

  async function handleChange(value: string) {
    const userId = value === UNASSIGNED ? null : value;
    try {
      await assign.mutateAsync({ ticketId, userId });
      const name = assignees.find((a) => a.user_id === userId)?.name;
      toast.success(userId ? `Assigned to ${name ?? "teammate"}` : "Assignment cleared");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not assign ticket");
    }
  }

  return (
    <Select value={current} onValueChange={handleChange} disabled={assign.isPending}>
      <SelectTrigger
        className={`${size === "sm" ? "h-7 text-xs" : "h-9 text-sm"} w-44 ${className ?? ""}`}
        aria-label="Ticket owner"
        data-testid={`assignee-select-${ticketId}`}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {assignedTo ? (
            <UserCheck className="h-3 w-3 shrink-0 text-emerald-600" />
          ) : (
            <UserX className="h-3 w-3 shrink-0 text-amber-600" />
          )}
          <SelectValue placeholder="Unassigned">
            <span className={`truncate ${assignedTo ? "" : "text-amber-700 dark:text-amber-500"}`}>
              {currentName ?? "Unassigned"}
            </span>
          </SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {isLoading && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading team…</div>
        )}
        {assignees.map((a) => (
          <SelectItem key={a.user_id} value={a.user_id}>
            <span className="flex items-center gap-2">
              <span>{a.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {ROLE_LABEL[a.role] ?? a.role}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
