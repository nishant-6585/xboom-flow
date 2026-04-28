import { useProfileNames } from "@/hooks/useProfileNames";
import { Badge } from "@/components/ui/badge";
import { User } from "lucide-react";

interface AssigneeCellProps {
  userId?: string | null;
  /** Pre-resolved name (e.g. from a hook that already joined profiles). Takes precedence over userId lookup. */
  name?: string | null;
  compact?: boolean;
}

/**
 * Consistent salesperson chip used in every lead-list table.
 * Displays "Unassigned" muted badge when no user is set.
 */
export const AssigneeCell = ({ userId, name, compact }: AssigneeCellProps) => {
  const { resolveName } = useProfileNames();
  const display = name?.trim() || resolveName(userId);
  const isUnassigned = display === "Unassigned" || display === "—";

  return (
    <Badge
      variant={isUnassigned ? "outline" : "secondary"}
      className={`gap-1 font-normal ${isUnassigned ? "text-muted-foreground" : ""} ${compact ? "text-[10px] px-1.5 py-0" : "text-xs"}`}
    >
      <User className="w-3 h-3" />
      {display}
    </Badge>
  );
};
