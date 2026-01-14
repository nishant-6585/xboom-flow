import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, LogIn, LogOut, Timer, Coffee, Play } from "lucide-react";
import { format } from "date-fns";
import { AttendanceLog } from "@/hooks/useHR";

interface AttendanceCardProps {
  todayAttendance: AttendanceLog | null;
  weeklyHours: number;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onStartBreak: () => void;
  onEndBreak: () => void;
  loading?: boolean;
}

export function AttendanceCard({
  todayAttendance,
  weeklyHours,
  onCheckIn,
  onCheckOut,
  onStartBreak,
  onEndBreak,
  loading,
}: AttendanceCardProps) {
  const isCheckedIn = !!todayAttendance?.check_in_time;
  const isCheckedOut = !!todayAttendance?.check_out_time;
  const isOnBreak = !!todayAttendance?.break_start_time && !todayAttendance?.break_end_time;

  const getStatusBadge = () => {
    if (!todayAttendance) {
      return <Badge variant="outline">Not Started</Badge>;
    }
    if (todayAttendance.status === 'on_leave') {
      return <Badge className="bg-purple-500">On Leave</Badge>;
    }
    if (isCheckedOut) {
      return <Badge className="bg-green-500">Completed</Badge>;
    }
    if (isOnBreak) {
      return <Badge className="bg-orange-500">On Break</Badge>;
    }
    if (isCheckedIn) {
      return <Badge className="bg-blue-500">Working</Badge>;
    }
    return <Badge variant="outline">Pending</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Today's Attendance
          </CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Check In</p>
            <p className="text-lg font-semibold">
              {todayAttendance?.check_in_time
                ? format(new Date(todayAttendance.check_in_time), 'hh:mm a')
                : '--:--'}
            </p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Check Out</p>
            <p className="text-lg font-semibold">
              {todayAttendance?.check_out_time
                ? format(new Date(todayAttendance.check_out_time), 'hh:mm a')
                : '--:--'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Today's Hours</span>
            </div>
            <span className="font-semibold">
              {todayAttendance?.working_hours?.toFixed(1) || '0.0'}h
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-orange-500/10 rounded-lg">
            <div className="flex items-center gap-2">
              <Coffee className="h-4 w-4 text-orange-500" />
              <span className="text-sm">Break</span>
            </div>
            <span className="font-semibold text-orange-600">
              {Math.round(todayAttendance?.total_break_minutes || 0)}m
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
          <span className="text-sm font-medium">This Week</span>
          <span className="font-bold text-primary">{weeklyHours.toFixed(1)}h</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {isCheckedOut ? (
            <>
              <Button
                size="lg"
                className="w-full col-span-2"
                onClick={onCheckIn}
                disabled={loading}
              >
                <LogIn className="mr-2 h-4 w-4" />
                Re-Check In
              </Button>
              <p className="col-span-2 text-center text-xs text-muted-foreground">
                Tip: After re-check in, you can use Start Break / End Break.
              </p>
            </>
          ) : (
            <>
              <Button
                size="lg"
                className="w-full"
                onClick={onCheckIn}
                disabled={loading || isCheckedIn}
              >
                <LogIn className="mr-2 h-4 w-4" />
                Check In
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full"
                onClick={onCheckOut}
                disabled={loading || !isCheckedIn || isOnBreak}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Check Out
              </Button>
            </>
          )}
        </div>

        {isCheckedIn && !isCheckedOut && (
          <div className="grid grid-cols-2 gap-3">
            {!isOnBreak ? (
              <Button
                size="lg"
                variant="secondary"
                className="w-full col-span-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-700"
                onClick={onStartBreak}
                disabled={loading}
              >
                <Coffee className="mr-2 h-4 w-4" />
                Start Break
              </Button>
            ) : (
              <Button
                size="lg"
                variant="secondary"
                className="w-full col-span-2 bg-green-500/10 hover:bg-green-500/20 text-green-700"
                onClick={onEndBreak}
                disabled={loading}
              >
                <Play className="mr-2 h-4 w-4" />
                End Break
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}