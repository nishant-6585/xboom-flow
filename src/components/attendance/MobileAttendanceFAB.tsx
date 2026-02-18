import { useState, useEffect } from 'react';
import { format, differenceInSeconds } from 'date-fns';
import { LogIn, LogOut, Coffee, Play, Clock, X, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAttendanceWidget, AttendanceWidgetStatus } from '@/hooks/useAttendanceWidget';
import { cn } from '@/lib/utils';

function WorkingTimerText({ checkInTime, totalBreakMins }: { checkInTime: string; totalBreakMins: number }) {
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
  return <>{elapsed}</>;
}

function BreakTimerText({ breakStart }: { breakStart: string }) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    const calc = () => {
      const sec = differenceInSeconds(new Date(), new Date(breakStart));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      setElapsed(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    calc();
    const id = setInterval(calc, 30000);
    return () => clearInterval(id);
  }, [breakStart]);
  return <>{elapsed}</>;
}

const STATUS_CONFIG: Record<AttendanceWidgetStatus, { color: string; dot: string; label: string }> = {
  not_checked_in: { color: 'bg-red-500 hover:bg-red-600', dot: 'bg-red-300', label: 'Not In' },
  working: { color: 'bg-green-600 hover:bg-green-700', dot: 'bg-green-300 animate-pulse', label: 'Working' },
  on_break: { color: 'bg-yellow-500 hover:bg-yellow-600', dot: 'bg-yellow-300', label: 'Break' },
  completed: { color: 'bg-muted hover:bg-muted/80', dot: 'bg-muted-foreground', label: 'Done' },
};

export function MobileAttendanceFAB() {
  const { todayAttendance, breaks, status, actionLoading, checkIn, checkOut, startBreak, endBreak } = useAttendanceWidget();
  const [sheetOpen, setSheetOpen] = useState(false);
  const cfg = STATUS_CONFIG[status];

  const handle = async (fn: () => Promise<boolean>) => { await fn(); };

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setSheetOpen(true)}
        className={cn(
          'fixed bottom-24 right-4 z-50 flex items-center gap-2 px-3 py-2.5 rounded-full shadow-lg text-white text-sm font-medium transition-all',
          cfg.color,
        )}
      >
        <span className={cn('w-2 h-2 rounded-full', cfg.dot)} />
        <span>{cfg.label}</span>
        {status === 'working' && todayAttendance?.check_in_time && (
          <span className="tabular-nums">
            <WorkingTimerText checkInTime={todayAttendance.check_in_time} totalBreakMins={todayAttendance.total_break_minutes || 0} />
          </span>
        )}
        {status === 'on_break' && todayAttendance?.break_start_time && (
          <span className="tabular-nums">
            <BreakTimerText breakStart={todayAttendance.break_start_time} />
          </span>
        )}
      </button>

      {/* Bottom Sheet Overlay */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSheetOpen(false)}
          />

          {/* Sheet */}
          <div className="relative bg-background rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <div className="flex items-center gap-2">
                <span className={cn('w-3 h-3 rounded-full', cfg.dot)} />
                <h3 className="font-semibold text-base">
                  {status === 'not_checked_in' && 'Not Checked In'}
                  {status === 'working' && 'Currently Working'}
                  {status === 'on_break' && 'On Break'}
                  {status === 'completed' && 'Day Completed'}
                </h3>
              </div>
              <button onClick={() => setSheetOpen(false)} className="p-1 rounded-full hover:bg-muted">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {/* Summary */}
            <div className="px-5 py-4 grid grid-cols-2 gap-4 border-b">
              <div className="bg-muted/50 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-1">Check In</p>
                <p className="text-lg font-bold">
                  {todayAttendance?.check_in_time
                    ? format(new Date(todayAttendance.check_in_time), 'hh:mm a')
                    : '—'}
                </p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-1">Check Out</p>
                <p className="text-lg font-bold">
                  {todayAttendance?.check_out_time
                    ? format(new Date(todayAttendance.check_out_time), 'hh:mm a')
                    : '—'}
                </p>
              </div>
              <div className="bg-green-500/10 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-1">Work Hours</p>
                <p className="text-lg font-bold text-green-700">
                  {status === 'working' && todayAttendance?.check_in_time ? (
                    <WorkingTimerText checkInTime={todayAttendance.check_in_time} totalBreakMins={todayAttendance.total_break_minutes || 0} />
                  ) : (
                    `${(todayAttendance?.working_hours || 0).toFixed(1)}h`
                  )}
                </p>
              </div>
              <div className="bg-yellow-500/10 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-1">Break Time</p>
                <p className="text-lg font-bold text-yellow-700">
                  {Math.round(todayAttendance?.total_break_minutes || 0)}m
                  {status === 'on_break' && todayAttendance?.break_start_time && (
                    <span className="text-sm"> + <BreakTimerText breakStart={todayAttendance.break_start_time} /></span>
                  )}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 py-4 space-y-3">
              {status === 'not_checked_in' && (
                <Button
                  className="w-full h-14 text-base bg-green-600 hover:bg-green-700"
                  onClick={() => handle(checkIn)}
                  disabled={actionLoading}
                >
                  <LogIn className="mr-3 h-5 w-5" />
                  Check In Now
                </Button>
              )}

              {status === 'working' && (
                <>
                  <Button
                    className="w-full h-14 text-base bg-yellow-500 hover:bg-yellow-600 text-white"
                    onClick={() => handle(startBreak)}
                    disabled={actionLoading}
                  >
                    <Coffee className="mr-3 h-5 w-5" />
                    Start Break
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-14 text-base border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => handle(checkOut)}
                    disabled={actionLoading}
                  >
                    <LogOut className="mr-3 h-5 w-5" />
                    Check Out
                  </Button>
                </>
              )}

              {status === 'on_break' && (
                <>
                  <Button
                    className="w-full h-14 text-base bg-green-600 hover:bg-green-700"
                    onClick={() => handle(endBreak)}
                    disabled={actionLoading}
                  >
                    <Play className="mr-3 h-5 w-5" />
                    End Break & Resume Work
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-14 text-base border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => handle(checkOut)}
                    disabled={actionLoading}
                  >
                    <LogOut className="mr-3 h-5 w-5" />
                    Check Out
                  </Button>
                </>
              )}

              {status === 'completed' && (
                <Button
                  variant="outline"
                  className="w-full h-14 text-base"
                  onClick={() => handle(checkIn)}
                  disabled={actionLoading}
                >
                  <LogIn className="mr-3 h-5 w-5" />
                  Re-Check In
                </Button>
              )}
            </div>

            {/* Breaks history */}
            {breaks.length > 0 && (
              <div className="px-5 pb-6 border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">Today's Breaks</p>
                <div className="space-y-2">
                  {breaks.map((b, i) => (
                    <div key={b.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl text-sm">
                      <span className="text-muted-foreground font-medium">Break {i + 1}</span>
                      <span>
                        {format(new Date(b.break_start_time), 'hh:mm a')}
                        {b.break_end_time ? ` – ${format(new Date(b.break_end_time), 'hh:mm a')}` : ' (active)'}
                      </span>
                      {b.break_duration_minutes && (
                        <Badge variant="secondary">{Math.round(b.break_duration_minutes)}m</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
