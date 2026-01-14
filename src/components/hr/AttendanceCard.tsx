import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, LogIn, LogOut, Timer } from "lucide-react";
import { format } from "date-fns";
import { AttendanceLog } from "@/hooks/useHR";

interface AttendanceCardProps {
  todayAttendance: AttendanceLog | null;
  weeklyHours: number;
  onCheckIn: () => void;
  onCheckOut: () => void;
  loading?: boolean;
}

export function AttendanceCard({
  todayAttendance,
  weeklyHours,
  onCheckIn,
  onCheckOut,
  loading,
}: AttendanceCardProps) {
  const isCheckedIn = !!todayAttendance?.check_in_time;
  const isCheckedOut = !!todayAttendance?.check_out_time;

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

        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Today's Hours</span>
          </div>
          <span className="font-semibold">
            {todayAttendance?.working_hours?.toFixed(1) || '0.0'}h
          </span>
        </div>

        <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
          <span className="text-sm font-medium">This Week</span>
          <span className="font-bold text-primary">{weeklyHours.toFixed(1)}h</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
            disabled={loading || !isCheckedIn || isCheckedOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Check Out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
