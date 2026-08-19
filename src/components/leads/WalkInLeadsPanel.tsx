import { useMemo, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlarmClock, CalendarClock, MapPin, Phone, Plus, Search, Store,
  TriangleAlert, User,
} from "lucide-react";
import { EmptyState, TableSkeleton } from "@/components/data-states";
import { WalkInLeadFormDialog } from "@/components/leads/WalkInLeadFormDialog";
import {
  useWalkInLeads, useUpdateWalkInOutcome, WALK_IN_OUTCOMES,
} from "@/hooks/useWalkInLeads";

const OUTCOME_LABEL = Object.fromEntries(
  WALK_IN_OUTCOMES.map((o) => [o.value, o.label]),
) as Record<string, string>;

const OUTCOME_STYLE: Record<string, string> = {
  purchased: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  quote_requested: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  demo_given: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  will_return: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  just_browsing: "bg-muted text-muted-foreground",
  not_interested: "bg-destructive/15 text-destructive",
};

type OutcomeFilter = "all" | "pending" | "overdue" | string;

export function WalkInLeadsPanel() {
  const [mineOnly, setMineOnly] = useState(false);
  const [q, setQ] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [formOpen, setFormOpen] = useState(false);

  const { walkIns, stats, isLoading } = useWalkInLeads(mineOnly);
  const updateOutcome = useUpdateWalkInOutcome();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return walkIns.filter((w) => {
      if (outcomeFilter === "pending" && w.visit_outcome) return false;
      if (outcomeFilter === "overdue" && !w.follow_up_overdue) return false;
      if (outcomeFilter !== "all" && outcomeFilter !== "pending" &&
          outcomeFilter !== "overdue" && w.visit_outcome !== outcomeFilter) return false;
      if (!needle) return true;
      return (
        (w.name ?? "").toLowerCase().includes(needle) ||
        (w.phone ?? "").toLowerCase().includes(needle) ||
        (w.company ?? "").toLowerCase().includes(needle) ||
        (w.store_location ?? "").toLowerCase().includes(needle) ||
        (w.products_interested ?? []).join(" ").toLowerCase().includes(needle)
      );
    });
  }, [walkIns, q, outcomeFilter]);

  async function setOutcome(leadId: number, value: string) {
    try {
      await updateOutcome.mutateAsync({ leadId, visitOutcome: value });
      toast.success("Outcome recorded");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not update the outcome");
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats — the two that need action are colour-coded; the rest are context */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatTile label="Walk-ins" value={stats.total} icon={Store} />
        <StatTile label="Today" value={stats.today} icon={CalendarClock} />
        <StatTile label="Awaiting outcome" value={stats.awaitingOutcome} icon={AlarmClock}
                  tone={stats.awaitingOutcome > 0 ? "warn" : undefined} />
        <StatTile label="Follow-up overdue" value={stats.overdue} icon={TriangleAlert}
                  tone={stats.overdue > 0 ? "bad" : undefined} />
        <StatTile label="Purchased" value={stats.purchased} icon={User} tone="good" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-8"
                 placeholder="Name, phone, company, store, product…" />
        </div>
        <Select value={outcomeFilter} onValueChange={(v) => setOutcomeFilter(v)}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All outcomes</SelectItem>
            <SelectItem value="pending">Awaiting outcome</SelectItem>
            <SelectItem value="overdue">Follow-up overdue</SelectItem>
            {WALK_IN_OUTCOMES.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant={mineOnly ? "default" : "outline"} onClick={() => setMineOnly((v) => !v)}>
          {mineOnly ? "Mine" : "Everyone"}
        </Button>
        <Button onClick={() => setFormOpen(true)} data-testid="walk-in-new">
          <Plus className="h-4 w-4 mr-1" /> New walk-in
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Store}
          title={walkIns.length === 0 ? "No walk-ins yet" : "Nothing matches those filters"}
          description={
            walkIns.length === 0
              ? "Record a customer who visits in person. It is assigned to you automatically."
              : "Try clearing the search or outcome filter."
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((w) => (
            <Card key={w.lead_id} className={w.follow_up_overdue ? "border-destructive/50" : ""}>
              <CardContent className="py-3 px-4 flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{w.name ?? "—"}</span>
                    {w.company && (
                      <span className="text-sm text-muted-foreground">· {w.company}</span>
                    )}
                    {w.visit_outcome ? (
                      <Badge className={OUTCOME_STYLE[w.visit_outcome] ?? ""}>
                        {OUTCOME_LABEL[w.visit_outcome] ?? w.visit_outcome}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-500">
                        Outcome not recorded
                      </Badge>
                    )}
                    {w.follow_up_overdue && (
                      <Badge className="bg-destructive/15 text-destructive">
                        <TriangleAlert className="h-3 w-3 mr-1" /> Follow-up overdue
                      </Badge>
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                    {w.phone && (
                      <a href={`tel:${w.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                        <Phone className="h-3 w-3" /> {w.phone}
                      </a>
                    )}
                    {w.store_location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {w.store_location}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" /> {w.assigned_to_name ?? "Unassigned"}
                    </span>
                    {w.visited_at && (
                      <span title={format(new Date(w.visited_at), "PPpp")}>
                        Visited {formatDistanceToNow(new Date(w.visited_at), { addSuffix: true })}
                      </span>
                    )}
                    {w.follow_up_at && (
                      <span className={w.follow_up_overdue ? "text-destructive" : ""}>
                        Follow up {format(new Date(w.follow_up_at), "d MMM")}
                      </span>
                    )}
                  </div>

                  {(w.products_interested?.length ?? 0) > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {w.products_interested!.map((p) => (
                        <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                      ))}
                    </div>
                  )}

                  {w.notes && (
                    <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{w.notes}</p>
                  )}
                </div>

                <div className="shrink-0">
                  <Select
                    value={w.visit_outcome ?? ""}
                    onValueChange={(v) => setOutcome(w.lead_id, v)}
                    disabled={updateOutcome.isPending}
                  >
                    <SelectTrigger className="h-8 w-48 text-xs"
                                   aria-label={`Outcome for ${w.name ?? "walk-in"}`}>
                      <SelectValue placeholder="Set outcome…" />
                    </SelectTrigger>
                    <SelectContent>
                      {WALK_IN_OUTCOMES.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <WalkInLeadFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}

function StatTile({
  label, value, icon: Icon, tone,
}: {
  label: string;
  value: number;
  icon: typeof Store;
  tone?: "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "bad" ? "text-destructive"
    : tone === "warn" ? "text-amber-600"
    : tone === "good" ? "text-emerald-600"
    : "";
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className={`text-2xl font-semibold mt-0.5 ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
