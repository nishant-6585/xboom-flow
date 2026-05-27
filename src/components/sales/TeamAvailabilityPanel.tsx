import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, CalendarOff, CheckCircle2, X, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useTeamAvailability,
  useCancelUnavailability,
  UNAVAILABILITY_REASONS,
  UnavailabilityWindow,
  daysRemaining,
  WEBSITE_LEAD_POOL,
} from "@/hooks/useTeamAvailability";
import { MarkUnavailableDialog } from "./MarkUnavailableDialog";

const reasonLabel = (r: string) =>
  UNAVAILABILITY_REASONS.find((x) => x.value === r)?.label ?? r;

const userName = (uid: string) =>
  WEBSITE_LEAD_POOL.find((m) => m.user_id === uid)?.name ?? uid.slice(0, 8);

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Manager surface for marking salespeople unavailable. Visible only to
 * admin / sales_manager (the parent route gates it; this component also
 * hides controls server-side via RLS).
 */
export function TeamAvailabilityPanel() {
  const { role } = useAuth();
  const canManage = role === "admin" || role === "sales_manager";
  const { windows, poolStatus, isLoading } = useTeamAvailability();
  const cancelMut = useCancelUnavailability();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultUser, setDefaultUser] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<UnavailabilityWindow | null>(null);

  const today = todayISO();
  const visibleWindows = useMemo(() => {
    const filtered = showPast
      ? windows
      : windows.filter((w) => w.ends_at >= today);
    return [...filtered].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [windows, showPast, today]);

  const openCreate = (uid?: string) => {
    setDefaultUser(uid ?? null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <CalendarOff className="h-6 w-6 text-primary" />
            Team Availability
          </h2>
          <p className="text-sm text-muted-foreground">
            New website leads automatically skip salespeople marked unavailable.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => openCreate()}>
            <Plus className="h-4 w-4 mr-1" /> Mark Unavailable
          </Button>
        )}
      </div>

      {/* Pool status grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Pool Status</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {poolStatus.map((p) => {
                const isOut = p.status === "unavailable";
                const w = p.currentWindow;
                return (
                  <button
                    key={p.user_id}
                    type="button"
                    onClick={() => canManage && !isOut && openCreate(p.user_id)}
                    disabled={!canManage || isOut}
                    className={`text-left rounded-lg border p-4 transition-colors ${
                      isOut
                        ? "border-amber-500/40 bg-amber-500/5"
                        : "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10"
                    } ${!canManage || isOut ? "cursor-default" : "cursor-pointer"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.role}</div>
                      </div>
                      {isOut ? (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10 shrink-0">
                          Unavailable
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 shrink-0">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Available
                        </Badge>
                      )}
                    </div>
                    {isOut && w && (
                      <div className="mt-2 space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {reasonLabel(w.reason)}
                          </Badge>
                          <span className="text-muted-foreground">
                            until {format(parseISO(w.ends_at), "dd MMM")} ·{" "}
                            {daysRemaining(w)} day{daysRemaining(w) === 1 ? "" : "s"} left
                          </span>
                        </div>
                        {w.notes && (
                          <div className="text-muted-foreground italic truncate">
                            "{w.notes}"
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Windows table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Unavailability Windows</CardTitle>
          <div className="flex items-center gap-2">
            <Switch id="show-past" checked={showPast} onCheckedChange={setShowPast} />
            <Label htmlFor="show-past" className="text-xs text-muted-foreground">
              Show past
            </Label>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-4">Loading…</div>
          ) : visibleWindows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No {showPast ? "" : "upcoming "}unavailability windows.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Salesperson</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead>Notes</TableHead>
                  {canManage && <TableHead className="w-16" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleWindows.map((w) => {
                  const ended = w.ends_at < today;
                  const totalDays =
                    Math.round(
                      (parseISO(w.ends_at).getTime() -
                        parseISO(w.starts_at).getTime()) /
                        (1000 * 60 * 60 * 24),
                    ) + 1;
                  return (
                    <TableRow key={w.id} className={ended ? "opacity-60" : ""}>
                      <TableCell className="font-medium">{userName(w.user_id)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {reasonLabel(w.reason)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(parseISO(w.starts_at), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(parseISO(w.ends_at), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {totalDays}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">
                        {w.notes || "—"}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          {!ended && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-destructive hover:text-destructive"
                              onClick={() => setPendingCancel(w)}
                            >
                              <X className="h-3.5 w-3.5 mr-1" /> Cancel
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <MarkUnavailableDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultUserId={defaultUser}
      />

      <AlertDialog
        open={!!pendingCancel}
        onOpenChange={(o) => !o && setPendingCancel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this unavailability window?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCancel && (
                <>
                  <strong>{userName(pendingCancel.user_id)}</strong> will become
                  available immediately and will start receiving new website
                  leads via round-robin again.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMut.isPending}>Keep window</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault();
                if (!pendingCancel) return;
                await cancelMut.mutateAsync({ id: pendingCancel.id });
                setPendingCancel(null);
              }}
              disabled={cancelMut.isPending}
            >
              {cancelMut.isPending ? "Cancelling…" : "Cancel window"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}