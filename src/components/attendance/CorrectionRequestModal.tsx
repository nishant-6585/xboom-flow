import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Clock, AlertTriangle, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AttendanceLog } from '@/hooks/useHR';
import { useAttendanceCorrectionRequests } from '@/hooks/useAttendanceCorrectionRequests';
import { supabase } from '@/integrations/supabase/client';

type CorrectionMode = 'checkout' | 'checkin' | 'both';

interface CorrectionRequestModalProps {
  log: AttendanceLog;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void | Promise<void>;
  mode?: CorrectionMode;
  /**
   * When true, the `log` object is a client-side placeholder (no DB row exists).
   * The row will be created on submit only; cancelling has no side effects.
   */
  isVirtual?: boolean;
}

export function CorrectionRequestModal({
  log,
  open,
  onOpenChange,
  onSubmitted,
  mode = 'both',
  isVirtual = false,
}: CorrectionRequestModalProps) {
  const { submitRequest } = useAttendanceCorrectionRequests();

  const [newCheckInTime, setNewCheckInTime] = useState(() =>
    log.check_in_time ? format(parseISO(log.check_in_time), 'HH:mm') : ''
  );
  const [newCheckOutTime, setNewCheckOutTime] = useState(() =>
    log.check_out_time ? format(parseISO(log.check_out_time), 'HH:mm') : ''
  );
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const checkInDisplay = log.check_in_time
    ? format(parseISO(log.check_in_time), 'hh:mm a')
    : '—';

  const currentCheckoutDisplay = log.check_out_time
    ? format(parseISO(log.check_out_time), 'hh:mm a')
    : '—';

  const buildCorrectedDate = (timeStr: string) => {
    const logDate = parseISO(log.date);
    const [hours, minutes] = timeStr.split(':').map(Number);
    const d = new Date(logDate);
    d.setHours(hours, minutes, 0, 0);
    return d;
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason for the correction');
      return;
    }

    const hasCheckInChange = newCheckInTime && newCheckInTime !== (log.check_in_time ? format(parseISO(log.check_in_time), 'HH:mm') : '');
    const hasCheckOutChange = newCheckOutTime && newCheckOutTime !== (log.check_out_time ? format(parseISO(log.check_out_time), 'HH:mm') : '');

    if (!hasCheckInChange && !hasCheckOutChange) {
      toast.error('Please change at least one time field');
      return;
    }

    const now = new Date();
    let requestedCheckIn = log.check_in_time;
    let requestedCheckOut = log.check_out_time;

    if (hasCheckInChange) {
      const corrected = buildCorrectedDate(newCheckInTime);
      if (corrected > now) {
        toast.error('Check-in time cannot be in the future');
        return;
      }
      const effectiveCheckout = hasCheckOutChange ? buildCorrectedDate(newCheckOutTime) : (log.check_out_time ? new Date(log.check_out_time) : null);
      if (effectiveCheckout && corrected >= effectiveCheckout) {
        toast.error('Check-in time must be before checkout time');
        return;
      }
      requestedCheckIn = corrected.toISOString();
    }

    if (hasCheckOutChange) {
      const corrected = buildCorrectedDate(newCheckOutTime);
      const effectiveCheckIn = hasCheckInChange ? buildCorrectedDate(newCheckInTime) : (log.check_in_time ? new Date(log.check_in_time) : null);
      // Overnight support: roll checkout to next day when earlier than check-in.
      if (effectiveCheckIn && corrected <= effectiveCheckIn) {
        corrected.setDate(corrected.getDate() + 1);
      }
      if (effectiveCheckIn) {
        const diffHours = (corrected.getTime() - effectiveCheckIn.getTime()) / (1000 * 60 * 60);
        if (diffHours > 24) {
          toast.error('Shift duration cannot exceed 24 hours');
          return;
        }
      }
      if (corrected > now) {
        toast.error('Checkout time cannot be in the future');
        return;
      }
      requestedCheckOut = corrected.toISOString();
    }

    setSaving(true);
    try {
      let attendanceLogId = log.id;

      if (isVirtual) {
        // Create the attendance_logs stub lazily so Cancel produces no DB writes.
        const { data: created, error: createErr } = await supabase
          .from('attendance_logs')
          .insert({
            employee_id: log.employee_id,
            date: log.date,
            status: 'present',
            source: 'regularization',
          })
          .select()
          .single();
        if (createErr) throw createErr;
        attendanceLogId = created.id;
      }

      await submitRequest({
        attendance_log_id: attendanceLogId,
        employee_id: log.employee_id,
        current_check_in_time: log.check_in_time,
        current_check_out_time: log.check_out_time,
        requested_check_in_time: requestedCheckIn,
        requested_check_out_time: requestedCheckOut,
        reason: reason.trim(),
      });

      toast.success('Correction request sent to HR for approval ✅');
      await onSubmitted();
    } catch (e: any) {
      const msg = e.message || 'Failed to submit correction request';
      if (msg.includes('idx_unique_pending_correction_per_log') || msg.includes('duplicate key')) {
        toast.error('A pending correction request already exists for this record');
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const showCheckIn = mode === 'checkin' || mode === 'both';
  const showCheckOut = mode === 'checkout' || mode === 'both';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Regularize Attendance
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Info banner */}
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-3 py-2.5">
            <Send className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-400">
              Your correction request will be sent to the <strong>HR team for approval</strong>. The attendance record will be updated once approved.
            </p>
          </div>

          {/* Date + badge */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">
              {format(parseISO(log.date), 'EEEE, dd MMM yyyy')}
            </p>
            {log.is_provisional_checkout && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/30">
                Provisional
              </Badge>
            )}
          </div>

          {/* Current times read-only */}
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Current Check-in
              </p>
              <p className="text-sm font-semibold">{checkInDisplay}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Current Checkout
              </p>
              <p className="text-sm font-semibold">{currentCheckoutDisplay}</p>
            </div>
          </div>

          {/* Editable times */}
          <div className="grid grid-cols-2 gap-3">
            {showCheckIn && (
              <div className="space-y-1.5">
                <Label htmlFor="corrected-checkin" className="text-sm">
                  Actual Check-In Time
                </Label>
                <Input
                  id="corrected-checkin"
                  type="time"
                  value={newCheckInTime}
                  onChange={e => setNewCheckInTime(e.target.value)}
                  className="h-10"
                />
              </div>
            )}
            {showCheckOut && (
              <div className="space-y-1.5">
                <Label htmlFor="corrected-checkout" className="text-sm">
                  Actual Checkout Time
                </Label>
                <Input
                  id="corrected-checkout"
                  type="time"
                  value={newCheckOutTime}
                  onChange={e => setNewCheckOutTime(e.target.value)}
                  className="h-10"
                />
              </div>
            )}
          </div>

          {/* Reason (mandatory) */}
          <div className="space-y-1.5">
            <Label htmlFor="correction-reason" className="text-sm">
              Reason for Correction <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="correction-reason"
              placeholder="e.g. Forgot to check in/out, system error, was working remotely..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !reason.trim()}
            className="bg-amber-600 hover:bg-amber-700 text-white gap-1"
          >
            <Send className="h-3.5 w-3.5" />
            {saving ? 'Submitting…' : 'Submit for Approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
