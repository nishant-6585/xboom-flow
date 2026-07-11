import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CalendarClock, ClipboardCheck, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { format, subDays } from "date-fns";

/**
 * Dashboard widget for HR/Admin showing pending leave and attendance-correction
 * approvals with quick links into the HR module. Hidden for non-HR users.
 */
export function HRPendingApprovalsWidget() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const isHROrAdmin = role === "admin" || role === "hr";

  const [pendingLeaves, setPendingLeaves] = useState(0);
  const [pendingCorrections, setPendingCorrections] = useState(0);
  const [attendanceAnomalies, setAttendanceAnomalies] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isHROrAdmin) return;
    let cancelled = false;

    const fetchCounts = async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const since = format(subDays(new Date(), 7), "yyyy-MM-dd");

      const [leaves, corrections, logsRes] = await Promise.all([
        supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted"),
        supabase
          .from("attendance_correction_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("attendance_logs")
          .select("id, check_in_time, check_out_time, working_hours, is_provisional_checkout, date")
          .gte("date", since)
          .lt("date", today),
      ]);
      if (cancelled) return;
      setPendingLeaves(leaves.count ?? 0);
      setPendingCorrections(corrections.count ?? 0);

      // Count HR-actionable anomalies in the last 7 days
      let anomalies = 0;
      for (const log of (logsRes.data ?? []) as any[]) {
        if (log.working_hours && log.working_hours > 12) anomalies++;
        if (log.check_in_time && !log.check_out_time && !log.is_provisional_checkout) anomalies++;
        if (log.is_provisional_checkout) anomalies++;
        if (log.check_in_time) {
          const h = new Date(log.check_in_time).getHours();
          if (h < 5) anomalies++;
        }
      }
      setAttendanceAnomalies(anomalies);
      setLoading(false);
    };

    fetchCounts();

    const channel = supabase
      .channel("hr-pending-approvals-widget")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leave_requests" },
        fetchCounts,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_correction_requests" },
        fetchCounts,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_logs" },
        fetchCounts,
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [isHROrAdmin]);

  if (!isHROrAdmin) return null;

  const total = pendingLeaves + pendingCorrections + attendanceAnomalies;

  return (
    <Card className="border-l-4 border-l-amber-500">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-amber-600" />
            HR Approvals
          </span>
          {total > 0 && (
            <Badge variant="destructive" className="gap-1">
              {total} pending
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading pending approvals…</p>
        ) : total === 0 ? (
          <Alert className="border-emerald-500/40 bg-emerald-500/5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertTitle>All caught up</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              No pending leave or attendance correction requests.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive" className="border-amber-500/60 bg-amber-500/10 text-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle>Action required</AlertTitle>
            <AlertDescription>
              You have {total} request{total === 1 ? "" : "s"} awaiting your approval.
              Please review them to avoid delays for employees.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => navigate("/hr?tab=leave")}
            className="flex items-center justify-between rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/60"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-blue-500/10">
                <CalendarClock className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Leave Requests</p>
                <p className="text-xs text-muted-foreground">
                  {pendingLeaves} pending
                </p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>

          <button
            type="button"
            onClick={() => navigate("/hr?tab=team_attendance&subtab=reports_alerts")}
            className="flex items-center justify-between rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/60"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-purple-500/10">
                <ClipboardCheck className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Attendance Corrections</p>
                <p className="text-xs text-muted-foreground">
                  {pendingCorrections} pending
                </p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>

          <button
            type="button"
            onClick={() => navigate("/hr?tab=team_attendance&subtab=reports_alerts")}
            className="flex items-center justify-between rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/60"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-amber-500/10">
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Attendance Anomalies</p>
                <p className="text-xs text-muted-foreground">
                  {attendanceAnomalies} to review (7d)
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
