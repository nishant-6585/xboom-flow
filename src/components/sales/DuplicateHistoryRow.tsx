import { useState } from "react";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export interface HistoryEntry {
  id: string;
  /** Short label, e.g. source name ("Interakt", "MyOperator"). */
  source?: string | null;
  /** Optional CSS classes for the source chip. */
  sourceChipClass?: string;
  /** Disposition / status text. */
  status?: string | null;
  /** Assigned salesperson. */
  assignedTo?: string | null;
  /** Created at — anything Date-parseable. */
  createdAt?: string | Date | null;
  /** Free-form preview / note. */
  note?: string | null;
}

interface Props {
  count: number;
  colSpan: number;
  entries: HistoryEntry[];
  /** Open by default. */
  defaultOpen?: boolean;
}

/**
 * Inline expander shown beneath a deduplicated primary lead row.
 * Lists every duplicate entry's source / assignee / created date / note.
 * Renders nothing if there are no duplicates (count <= 1).
 */
export function DuplicateHistoryRow({ count, colSpan, entries, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  if (count <= 1 || entries.length === 0) return null;

  return (
    <TableRow className="border-0 hover:bg-transparent">
      <TableCell colSpan={colSpan} className="border-0 pl-[52px] py-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span>
            {entries.length} duplicate {entries.length === 1 ? "entry" : "entries"}
            {!open && (
              <> · Same contact across {Array.from(new Set(entries.map((e) => e.source).filter(Boolean))).join(", ") || "sources"}</>
            )}
          </span>
        </button>

        {open && (
          <div className="mt-1.5 pl-4 space-y-1.5">
            {entries.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
              >
                {e.source && (
                  <Badge variant="secondary" className={cn("text-[10px] h-5", e.sourceChipClass)}>
                    {e.source}
                  </Badge>
                )}
                {e.createdAt && (
                  <span className="font-medium text-foreground/80">
                    {format(new Date(e.createdAt), "dd MMM yyyy, HH:mm")}
                  </span>
                )}
                {e.status && (
                  <Badge variant="outline" className="text-[10px] h-5 capitalize">
                    {e.status}
                  </Badge>
                )}
                {e.assignedTo && (
                  <span>· {e.assignedTo}</span>
                )}
                {e.note && (
                  <span className="truncate max-w-[420px]">· {e.note}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

interface BadgeOnlyProps {
  count: number;
}

/** Small inline badge for grouped rows (e.g. shown on the primary row's name cell). */
export function DuplicateCountBadge({ count }: BadgeOnlyProps) {
  if (count <= 1) return null;
  return (
    <Badge
      variant="outline"
      className="ml-2 h-5 text-[10px] gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10"
      title={`${count} entries merged as duplicates`}
    >
      <Layers className="h-3 w-3" />
      ×{count}
    </Badge>
  );
}