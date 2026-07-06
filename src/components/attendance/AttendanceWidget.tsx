import { useState, useEffect } from 'react';
import { format, differenceInSeconds } from 'date-fns';
import { LogIn, LogOut, Coffee, Play, Clock, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAttendanceWidget, AttendanceWidgetStatus } from '@/hooks/useAttendanceWidget';
import { cn } from '@/lib/utils';

function useLiveTimer(startTime: string | null | undefined, active: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!startTime || !active) { setSeconds(0); return; }
    const calc = () => {
      const diff = differenceInSeconds(new Date(), new Date(startTime));
      setSeconds(Math.max(0, diff));
    };
    calc();
    const interval = setInterval(calc, 10000); // update every 10s
    return () => clearInterval(interval);
  }, [startTime, active]);

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function StatusDot({ status }: { status: AttendanceWidgetStatus }) {
  return (
    <span className={cn(
      'inline-block w-2 h-2 rounded-full shrink-0',
      status === 'not_checked_in' && 'bg-red-500',
      status === 'working' && 'bg-green-500 animate-pulse',
      status === 'on_break' && 'bg-yellow-500',
      status === 'completed' && 'bg-muted-foreground',
    )} />
  );
}

function WorkingTimer({ checkInTime, totalBreakMins }: { checkInTime: string; totalBreakMins: number }) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    const calc = () => {
      const totalSec = differenceInSeconds(new Date(), new Date(checkInTime));
      const workSec = Math.max(0, totalSec - (totalBreakMins * 60));
      const h = Math.floor(workSec / 3600);
      const m = Math.floor((workSec % 3600) / 60);
      setElapsed(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    calc();
    const id = setInterval(calc, 30000);
    return () => clearInterval(id);
  }, [checkInTime, totalBreakMins]);
  return <span className="text-green-600 font-medium tabular-nums">{elapsed}</span>;
}

function BreakTimer({ breakStart }: { breakStart: string }) {
  const elapsed = useLiveTimer(breakStart, true);
  return <span className="text-yellow-600 font-medium tabular-nums">{elapsed}</span>;
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="tabular-nums font-mono">
      {format(now, 'hh:mm:ss a')}
    </span>
  );
}

export function AttendanceWidget() {
  const { todayAttendance, breaks, status, actionLoading, checkIn, checkOut, startBreak, endBreak } = useAttendanceWidget();
  const [open, setOpen] = useState(false);

  const handleAction = async (fn: () => Promise<boolean>) => {
    await fn();
    // keep popover open so user sees the updated state
  };

  const statusLabel = {
    not_checked_in: 'Not Checked In',
    working: 'Working',
    on_break: 'On Break',
    completed: 'Completed',
  }[status];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-muted/60 transition-colors text-sm">
          <StatusDot status={status} />
          <span className="hidden sm:inline text-muted-foreground font-medium">
            {status === 'working' && todayAttendance?.check_in_time ? (
              <WorkingTimer
                checkInTime={todayAttendance.check_in_time}
                totalBreakMins={todayAttendance.total_break_minutes || 0}
              />
            ) : status === 'on_break' && todayAttendance?.break_start_time ? (
              <BreakTimer breakStart={todayAttendance.break_start_time} />
            ) : (
              <span>{statusLabel}</span>
            )}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-72 p-0" align="end">
        {/* Header */}
        <div className={cn(
          'px-4 py-3 border-b flex items-center justify-between',
          status === 'working' && 'bg-green-500/10',
          status === 'on_break' && 'bg-yellow-500/10',
          status === 'completed' && 'bg-muted/50',
          status === 'not_checked_in' && 'bg-red-500/10',
        )}>
          <div className="flex items-center gap-2">
            <StatusDot status={status} />
            <span className="font-semibold text-sm">{statusLabel}</span>
          </div>
          <div className="flex flex-col items-end leading-tight">
            <span className="text-xs font-semibold text-foreground"><LiveClock /></span>
            <span className="text-[10px] text-muted-foreground">{format(new Date(), 'dd MMM')}</span>
          </div>
        </div>

        {/* Today Summary */}
        <div className="px-4 py-3 grid grid-cols-2 gap-3 border-b">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Check In</p>
            <p className="font-medium text-sm">
              {todayAttendance?.check_in_time
                ? format(new Date(todayAttendance.check_in_time), 'hh:mm a')
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Check Out</p>
            <p className="font-medium text-sm">
              {todayAttendance?.check_out_time
                ? format(new Date(todayAttendance.check_out_time), 'hh:mm a')
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Work Hours</p>
            <p className="font-medium text-sm text-green-700">
              {todayAttendance?.working_hours != null
                ? `${todayAttendance.working_hours.toFixed(1)}h`
                : status === 'working' && todayAttendance?.check_in_time
                ? <WorkingTimer checkInTime={todayAttendance.check_in_time} totalBreakMins={todayAttendance.total_break_minutes || 0} />
                : '0.0h'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Break Time</p>
            <p className="font-medium text-sm text-yellow-700">
              {Math.round(todayAttendance?.total_break_minutes || 0)}m
              {status === 'on_break' && todayAttendance?.break_start_time && (
                <> + <BreakTimer breakStart={todayAttendance.break_start_time} /></>
              )}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 py-3 space-y-2">
          {status === 'not_checked_in' && (
            <Button className="w-full" size="sm" onClick={() => handleAction(checkIn)} disabled={actionLoading}>
              <LogIn className="mr-2 h-4 w-4" />
              Check In
            </Button>
          )}

          {status === 'working' && (
            <>
              <Button
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-white"
                size="sm"
                onClick={() => handleAction(startBreak)}
                disabled={actionLoading}
              >
                <Coffee className="mr-2 h-4 w-4" />
                Start Break
              </Button>
              <Button
                variant="outline"
                className="w-full border-red-200 text-red-600 hover:bg-red-50"
                size="sm"
                onClick={() => handleAction(checkOut)}
                disabled={actionLoading}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Check Out
              </Button>
            </>
          )}

          {status === 'on_break' && (
            <>
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                size="sm"
                onClick={() => handleAction(endBreak)}
                disabled={actionLoading}
              >
                <Play className="mr-2 h-4 w-4" />
                End Break
              </Button>
              <Button
                variant="outline"
                className="w-full border-red-200 text-red-600 hover:bg-red-50"
                size="sm"
                onClick={() => handleAction(checkOut)}
                disabled={actionLoading}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Check Out
              </Button>
            </>
          )}

          {status === 'completed' && (
            <Button variant="outline" className="w-full" size="sm" onClick={() => handleAction(checkIn)} disabled={actionLoading}>
              <LogIn className="mr-2 h-4 w-4" />
              Re-Check In
            </Button>
          )}
        </div>

        {/* Breaks history */}
        {breaks.length > 0 && (
          <div className="px-4 pb-3 border-t pt-2">
            <p className="text-xs text-muted-foreground mb-1.5 font-medium">Today's Breaks</p>
            <div className="space-y-1">
              {breaks.map((b, i) => (
                <div key={b.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Break {i + 1}</span>
                  <span>
                    {format(new Date(b.break_start_time), 'hh:mm a')}
                    {b.break_end_time ? ` – ${format(new Date(b.break_end_time), 'hh:mm a')}` : ' (active)'}
                  </span>
                  {b.break_duration_minutes && (
                    <Badge variant="secondary" className="text-xs py-0">{Math.round(b.break_duration_minutes)}m</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
