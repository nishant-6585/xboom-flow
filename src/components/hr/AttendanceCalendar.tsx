import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, getDay } from "date-fns";
import { AttendanceLog, AttendanceStatus } from "@/hooks/useHR";
import { useState } from "react";

interface AttendanceCalendarProps {
  logs: AttendanceLog[];
  month: Date;
  onMonthChange: (month: Date) => void;
}

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: 'bg-green-500',
  absent: 'bg-red-500',
  half_day: 'bg-yellow-500',
  on_leave: 'bg-purple-500',
  weekend: 'bg-gray-300',
  holiday: 'bg-blue-300',
};

export function AttendanceCalendar({ logs, month, onMonthChange }: AttendanceCalendarProps) {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const days = eachDayOfInterval({ start, end });
  
  // Pad start of month to align with weekday
  const startPadding = getDay(start);
  const paddedDays = Array(startPadding).fill(null).concat(days);

  const getLogForDate = (date: Date): AttendanceLog | undefined => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return logs.find((log) => log.date === dateStr);
  };

  const prevMonth = () => {
    onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <CardTitle className="text-lg">
            {format(month, 'MMMM yyyy')}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
            <div key={day} className="text-xs font-medium text-muted-foreground py-1">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {paddedDays.map((day, idx) => {
            if (!day) {
              return <div key={`pad-${idx}`} className="aspect-square" />;
            }
            
            const log = getLogForDate(day);
            const isWeekend = getDay(day) === 0 || getDay(day) === 6;
            
            return (
              <div
                key={day.toISOString()}
                className={`
                  aspect-square flex flex-col items-center justify-center rounded-md text-sm
                  ${isToday(day) ? 'ring-2 ring-primary' : ''}
                  ${!isSameMonth(day, month) ? 'text-muted-foreground' : ''}
                `}
              >
                <span className={isWeekend ? 'text-muted-foreground' : ''}>{format(day, 'd')}</span>
                {log && (
                  <div className={`w-2 h-2 rounded-full mt-0.5 ${STATUS_COLORS[log.status]}`} />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
          <div className="flex items-center gap-1 text-xs">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>Present</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span>Absent</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <div className="w-3 h-3 rounded-full bg-purple-500" />
            <span>Leave</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span>Half Day</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
