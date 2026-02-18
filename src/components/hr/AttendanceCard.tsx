import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Timer, Coffee, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { AttendanceLog } from "@/hooks/useHR";

interface AttendanceCardProps {
  todayAttendance: AttendanceLog | null;
  weeklyHours: number;
}

export function AttendanceCard({ todayAttendance, weeklyHours }: AttendanceCardProps) {
  const isCheckedIn = !!todayAttendance?.check_in_time;
  const isCheckedOut = !!todayAttendance?.check_out_time;
  const isOnBreak = !!todayAttendance?.break_start_time && !todayAttendance?.break_end_time;

  const getStatusBadge = () => {
    if (!todayAttendance || !isCheckedIn) return <Badge variant="outline" className="border-red-300 text-red-600">Not Checked In</Badge>;
    if (todayAttendance.status === 'on_leave') return <Badge className="bg-purple-500">On Leave</Badge>;
    if (isCheckedOut) return <Badge className="bg-green-600">Completed</Badge>;
    if (isOnBreak) return <Badge className="bg-orange-500">On Break</Badge>;
    return <Badge className="bg-blue-500">Working</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Today's Summary
          </CardTitle>
          {getStatusBadge()}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Use the attendance widget in the header (or the button on mobile) to mark attendance.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Check In</p>
            <p className="text-base font-semibold">
              {todayAttendance?.check_in_time
                ? format(new Date(todayAttendance.check_in_time), 'hh:mm a')
                : '—'}
            </p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Check Out</p>
            <p className="text-base font-semibold">
              {todayAttendance?.check_out_time
                ? format(new Date(todayAttendance.check_out_time), 'hh:mm a')
                : '—'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Today</span>
            </div>
            <span className="font-semibold text-sm">
              {todayAttendance?.working_hours?.toFixed(1) || '0.0'}h
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-orange-500/10 rounded-lg">
            <div className="flex items-center gap-2">
              <Coffee className="h-4 w-4 text-orange-500" />
              <span className="text-sm">Break</span>
            </div>
            <span className="font-semibold text-sm text-orange-600">
              {Math.round(todayAttendance?.total_break_minutes || 0)}m
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">This Week</span>
          </div>
          <span className="font-bold text-primary">{weeklyHours.toFixed(1)}h</span>
        </div>
      </CardContent>
    </Card>
  );
}
