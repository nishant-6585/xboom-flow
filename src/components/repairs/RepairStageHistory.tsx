import { format } from "date-fns";
import { useRepairStageHistory } from "@/hooks/useRepairs";
import { RepairStageBadge } from "./RepairStageBadge";
import { ArrowRight, History, Loader2 } from "lucide-react";

interface Props {
  repairId: string;
}

/**
 * Read-only audit timeline of every stage change for a repair.
 * Newest event first. Pure presentation — fetch lives in the hook.
 */
export function RepairStageHistory({ repairId }: Props) {
  const { history, loading } = useRepairStageHistory(repairId);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading history…
      </div>
    );
  }

  if (!history.length) {
    return (
      <div className="text-sm text-muted-foreground py-2 flex items-center gap-2">
        <History className="h-4 w-4" />
        No stage changes recorded yet.
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {history.map((row) => (
        <li
          key={row.id}
          className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm border-l-2 border-border pl-3"
        >
          <div className="flex items-center gap-2 flex-wrap">
            {row.from_stage ? (
              <>
                <RepairStageBadge stage={row.from_stage} />
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </>
            ) : null}
            <RepairStageBadge stage={row.to_stage} />
          </div>
          <div className="text-xs text-muted-foreground sm:ml-auto flex flex-col sm:items-end">
            <span>{format(new Date(row.changed_at), "dd MMM yyyy, HH:mm")}</span>
            <span>by {row.changed_by_name || "System"}</span>
          </div>
          {row.notes && (
            <div className="text-xs text-muted-foreground italic w-full sm:basis-full">
              "{row.notes}"
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}