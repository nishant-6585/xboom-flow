import { Layers, Mail, Phone, MapPin, Building2, User } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export interface DuplicateLeadEntry {
  id: string;
  createdAt?: string | Date | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  city?: string | null;
  product?: string | null;
  source?: string | null;
  status?: string | null;
  assignedTo?: string | null;
}

interface Props {
  colSpan: number;
  /** Display label for the contact, e.g. phone / email / name. */
  headerLabel: string;
  count: number;
  entries: DuplicateLeadEntry[];
  onSelect?: (entry: DuplicateLeadEntry) => void;
}

/**
 * Compact history sub-row shown beneath a deduplicated primary lead row.
 * Mirrors the MyOperator CallLogsPanel history style: amber-tinted single
 * cell spanning all columns, with one pill per earlier entry.
 */
export function DuplicateLeadsHistoryRow({ colSpan, headerLabel, count, entries, onSelect }: Props) {
  if (count <= 0 || entries.length === 0) return null;
  return (
    <TableRow className="bg-amber-500/5 hover:bg-amber-500/5">
      <TableCell colSpan={colSpan} className="py-2 px-4">
        <div className="text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-300/80 font-medium mb-2 flex items-center gap-1">
          <Layers className="w-3 h-3" />
          Earlier entries from {headerLabel} ({count})
        </div>
        <div className="space-y-1">
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-3 text-xs px-2 py-1.5 rounded-md border border-amber-500/15 bg-background/40 hover:bg-background/70 cursor-pointer"
              onClick={() => onSelect?.(e)}
            >
              <span className="text-muted-foreground shrink-0 min-w-[150px]">
                {e.createdAt ? format(new Date(e.createdAt), "dd MMM yyyy, HH:mm") : "—"}
              </span>
              {e.name && (
                <span className="shrink-0 flex items-center gap-1 font-medium text-foreground">
                  <User className="w-3 h-3 text-muted-foreground" />
                  {e.name}
                </span>
              )}
              {e.phone && (
                <span className="shrink-0 flex items-center gap-1 text-muted-foreground">
                  <Phone className="w-3 h-3" />
                  {e.phone}
                </span>
              )}
              {e.email && (
                <span className="shrink-0 flex items-center gap-1 text-muted-foreground truncate max-w-[200px]">
                  <Mail className="w-3 h-3" />
                  {e.email}
                </span>
              )}
              {e.company && (
                <span className="shrink-0 flex items-center gap-1 text-muted-foreground truncate max-w-[160px]">
                  <Building2 className="w-3 h-3" />
                  {e.company}
                </span>
              )}
              {e.city && (
                <span className="shrink-0 flex items-center gap-1 text-muted-foreground">
                  <MapPin className="w-3 h-3" />
                  {e.city}
                </span>
              )}
              {e.product && (
                <span className="text-foreground/80 truncate flex-1">{e.product}</span>
              )}
              {e.source && (
                <span className="text-muted-foreground shrink-0 text-[10px] uppercase tracking-wide">{e.source}</span>
              )}
              {e.status && (
                <span className="text-muted-foreground shrink-0">· {e.status}</span>
              )}
              {e.assignedTo && (
                <span className="text-muted-foreground shrink-0">→ {e.assignedTo}</span>
              )}
            </div>
          ))}
        </div>
      </TableCell>
    </TableRow>
  );
}