import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Clock, UserX, ArrowRight, ClipboardCheck, CheckCircle2 } from "lucide-react";

interface AlertRow {
  log_id: string;
  date: string;
  type: "missing_checkout" | "provisional";
  description: string;
}

/**
 * Employee-side dashboard widget: surfaces attendance items that require the
 * logged-in employee to take action (missing checkout, provisional/auto-checkout
 * that needs verification) in the last 14 days. Also tracks pending correction
 * requests the employee already submitted. Links back into My Attendance so the
 * employee can raise/track a correction.
 */
export function MyAttendanceAlertsWidget() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!emp?.id) {
        if (!cancelled) {
          setAlerts([]);
          setPendingRequests(0);
          setLoading(false);
        }
        return;
      }

      const today = format(new Date(), "yyyy-MM-dd");
      const since = format(subDays(new Date(), 14), "yyyy-MM-dd");

      const [logsRes, corrRes, pendingRes] = await Promise.all([
        supabase
          .from("attendance_logs")
          .select("id, date, check_in_time, check_out_time, is_provisional_checkout")
          .eq("employee_id", emp.id)
          .gte("date", since)
          .lt("date", today)
          .order("date", { ascending: false }),
        supabase
          .from("attendance_correction_requests")
          .select("attendance_log_id, status")
          .eq("employee_id", emp.id)
          .in("status", ["pending", "approved"]),
        supabase
          .from("attendance_correction_requests")
          .select("id", { count: "exact", head: true })
          .eq("employee_id", emp.id)
          .eq("status", "pending"),
      ]);

      if (cancelled) return;

      const suppressed = new Set(
        (corrRes.data ?? []).map((r: any) => r.attendance_log_id as string),
      );
      const rows: AlertRow[] = [];
      for (const log of (logsRes.data ?? []) as any[]) {
        if (suppressed.has(log.id)) continue;
        if (log.check_in_time && !log.check_out_time && !log.is_provisional_checkout) {
          rows.push({
            log_id: log.id,
            date: log.date,
            type: "missing_checkout",
            description: `Missing checkout on ${format(new Date(log.date), "dd MMM")} — checked in at ${format(new Date(log.check_in_time), "hh:mm a")}`,
          });
        } else if (log.is_provisional_checkout) {
          rows.push({
            log_id: log.id,
            date: log.date,
            type: "provisional",
            description: `Auto-checkout applied on ${format(new Date(log.date), "dd MMM")} — please verify or raise a correction`,
          });
        }
      }

      setAlerts(rows);
      setPendingRequests(pendingRes.count ?? 0);
      setLoading(false);
    };

    load();

    const channel = supabase
      .channel("my-attendance-alerts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_logs" },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_correction_requests" },
        load,
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Hide entirely when nothing needs the employee's attention.
  if (loading) return null;
  if (alerts.length === 0 && pendingRequests === 0) return null;

  const total = alerts.length;

  return (
    <Card className="border-l-4 border-l-amber-500">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            My Attendance Alerts
          </span>
          {total > 0 && (
            <Badge variant="destructive" className="gap-1">
              {total} action needed
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {total > 0 ? (
          <Alert variant="destructive" className="border-amber-500/60 bg-amber-500/10 text-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle>Please review your attendance</AlertTitle>
            <AlertDescription>
              You have {total} attendance entr{total === 1 ? "y" : "ies"} that need your action.
              Raise a correction request so HR can approve the fix.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-emerald-500/40 bg-emerald-500/5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertTitle>Awaiting HR review</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              Your correction request is with HR for approval.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          {alerts.slice(0, 4).map((a) => {
            const Icon = a.type === "missing_checkout" ? UserX : Clock;
            return (
              <div
                key={`${a.log_id}-${a.type}`}
                className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs bg-amber-50/50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-200"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="flex-1">{a.description}</span>
              </div>
            );
          })}
          {alerts.length > 4 && (
            <p className="text-xs text-muted-foreground pl-1">
              + {alerts.length - 4} more…
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => navigate("/hr?tab=home")}
            className="flex items-center justify-between rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/60"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-amber-500/10">
                <ClipboardCheck className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Fix attendance</p>
                <p className="text-xs text-muted-foreground">
                  Raise a correction request
                </p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>

          <button
            type="button"
            onClick={() => navigate("/hr?tab=home")}
            className="flex items-center justify-between rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/60"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-blue-500/10">
                <Clock className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium">My requests</p>
                <p className="text-xs text-muted-foreground">
                  {pendingRequests} awaiting HR
                </p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
