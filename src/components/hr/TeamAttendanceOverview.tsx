import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, CheckCircle2, XCircle, Clock, Coffee, CalendarCheck, AlertCircle, PartyPopper } from "lucide-react";
import { format } from "date-fns";
import { EmployeeAttendanceStatus } from "@/hooks/useHR";
import { useHolidays } from "@/hooks/useHolidays";
import { cn } from "@/lib/utils";

interface TeamAttendanceOverviewProps {
  teamStatus: EmployeeAttendanceStatus[];
  loading?: boolean;
}

export function TeamAttendanceOverview({ teamStatus, loading }: TeamAttendanceOverviewProps) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const { isHoliday, getHoliday } = useHolidays(new Date().getFullYear());
  const todayIsHoliday = isHoliday(todayStr);
  const holidayInfo = getHoliday(todayStr);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Attendance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const checkedIn = teamStatus.filter(
    (s) => s.todayLog?.check_in_time && !s.todayLog?.check_out_time
  );
  const checkedOut = teamStatus.filter(
    (s) => s.todayLog?.check_in_time && s.todayLog?.check_out_time
  );
  const onBreak = teamStatus.filter(
    (s) => s.todayLog?.break_start_time && !s.todayLog?.break_end_time
  );
  const onLeave = teamStatus.filter((s) => s.approvedLeave);
  const absent = todayIsHoliday
    ? [] // On holidays, nobody is absent
    : teamStatus.filter((s) => !s.todayLog?.check_in_time && !s.approvedLeave);
  const workedOnHoliday = todayIsHoliday
    ? teamStatus.filter((s) => !!s.todayLog?.check_in_time)
    : [];

  const getStatusBadge = (status: EmployeeAttendanceStatus) => {
    if (todayIsHoliday && !status.todayLog?.check_in_time && !status.approvedLeave) {
      return (
        <Badge className="bg-blue-500">
          <PartyPopper className="h-3 w-3 mr-1" />
          Holiday
        </Badge>
      );
    }
    if (todayIsHoliday && status.todayLog?.check_in_time) {
      return (
        <Badge className="bg-cyan-500">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Worked on Holiday
        </Badge>
      );
    }
    if (status.approvedLeave) {
      return (
        <Badge className="bg-purple-500">
          <CalendarCheck className="h-3 w-3 mr-1" />
          On Leave
        </Badge>
      );
    }
    if (status.pendingLeave) {
      return (
        <Badge variant="outline" className="border-purple-500 text-purple-600">
          <AlertCircle className="h-3 w-3 mr-1" />
          Leave Pending
        </Badge>
      );
    }
    if (!status.todayLog?.check_in_time) {
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Absent
        </Badge>
      );
    }
    if (status.todayLog.break_start_time && !status.todayLog.break_end_time) {
      return (
        <Badge className="bg-orange-500">
          <Coffee className="h-3 w-3 mr-1" />
          On Break
        </Badge>
      );
    }
    if (status.todayLog.check_out_time) {
      return (
        <Badge className="bg-green-500">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    }
    return (
      <Badge className="bg-blue-500">
        <Clock className="h-3 w-3 mr-1" />
        Working
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Team Attendance Today
          </span>
          <span className="text-sm font-normal text-muted-foreground">
            {format(new Date(), "dd MMM yyyy")}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Holiday Banner */}
        {todayIsHoliday && holidayInfo && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/80 dark:bg-blue-950/20 dark:border-blue-800 px-3 py-2">
            <PartyPopper className="h-4 w-4 text-blue-600 shrink-0" />
            <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
              🎉 Holiday — {holidayInfo.name}
            </p>
          </div>
        )}

        {/* Summary Stats */}
        <div className={cn("grid gap-2 text-center", todayIsHoliday ? "grid-cols-3" : "grid-cols-5")}>
          {!todayIsHoliday && (
            <>
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <p className="text-lg font-bold text-blue-600">{checkedIn.length}</p>
                <p className="text-xs text-muted-foreground">Working</p>
              </div>
              <div className="p-2 bg-green-500/10 rounded-lg">
                <p className="text-lg font-bold text-green-600">{checkedOut.length}</p>
                <p className="text-xs text-muted-foreground">Done</p>
              </div>
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <p className="text-lg font-bold text-orange-600">{onBreak.length}</p>
                <p className="text-xs text-muted-foreground">Break</p>
              </div>
            </>
          )}
          {todayIsHoliday && (
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <p className="text-lg font-bold text-blue-600">{teamStatus.length - workedOnHoliday.length - onLeave.length}</p>
              <p className="text-xs text-muted-foreground">Holiday</p>
            </div>
          )}
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <p className="text-lg font-bold text-purple-600">{onLeave.length}</p>
            <p className="text-xs text-muted-foreground">Leave</p>
          </div>
          {todayIsHoliday ? (
            <div className="p-2 bg-cyan-500/10 rounded-lg">
              <p className="text-lg font-bold text-cyan-600">{workedOnHoliday.length}</p>
              <p className="text-xs text-muted-foreground">Worked</p>
            </div>
          ) : (
            <div className="p-2 bg-red-500/10 rounded-lg">
              <p className="text-lg font-bold text-red-600">{absent.length}</p>
              <p className="text-xs text-muted-foreground">Absent</p>
            </div>
          )}
        </div>

        {/* Employee List */}
        <ScrollArea className="h-[400px]">
          <div className="space-y-2">
            {teamStatus.map((status) => (
              <div
                key={status.employee.id}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{status.employee.name}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{status.employee.department}</span>
                    {status.todayLog?.check_in_time && (
                      <>
                        <span>•</span>
                        <span>
                          In: {format(new Date(status.todayLog.check_in_time), "hh:mm a")}
                        </span>
                      </>
                    )}
                    {status.todayLog?.check_out_time && (
                      <>
                        <span>•</span>
                        <span>
                          Out: {format(new Date(status.todayLog.check_out_time), "hh:mm a")}
                        </span>
                      </>
                    )}
                  </div>
                  {status.todayLog?.total_break_minutes && status.todayLog.total_break_minutes > 0 && (
                    <p className="text-xs text-orange-600">
                      Break: {Math.round(status.todayLog.total_break_minutes)}m
                    </p>
                  )}
                  {status.approvedLeave && (
                    <p className="text-xs text-purple-600">
                      {status.approvedLeave.leave_type} leave: {format(new Date(status.approvedLeave.start_date), "dd MMM")} - {format(new Date(status.approvedLeave.end_date), "dd MMM")}
                    </p>
                  )}
                  {status.pendingLeave && !status.approvedLeave && (
                    <p className="text-xs text-amber-600">
                      Pending {status.pendingLeave.leave_type} leave: {format(new Date(status.pendingLeave.start_date), "dd MMM")} - {format(new Date(status.pendingLeave.end_date), "dd MMM")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {status.todayLog?.working_hours && status.todayLog.working_hours > 0 && (
                    <span className="text-sm font-medium">
                      {status.todayLog.working_hours.toFixed(1)}h
                    </span>
                  )}
                  {getStatusBadge(status)}
                </div>
              </div>
            ))}
            {teamStatus.length === 0 && (
              <p className="text-center py-8 text-muted-foreground">
                No employees found
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
