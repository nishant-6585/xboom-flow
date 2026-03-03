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

type CorrectionMode = 'checkout' | 'checkin';

interface CorrectionRequestModalProps {
  log: AttendanceLog;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
  mode?: CorrectionMode;
}

export function CorrectionRequestModal({
  log,
  open,
  onOpenChange,
  onSubmitted,
  mode = 'checkout',
}: CorrectionRequestModalProps) {
  const { submitRequest } = useAttendanceCorrectionRequests();

  const [newTime, setNewTime] = useState(() => {
    if (mode === 'checkin' && log.check_in_time) return format(parseISO(log.check_in_time), 'HH:mm');
    if (mode === 'checkout' && log.check_out_time) return format(parseISO(log.check_out_time), 'HH:mm');
    return '';
  });
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const isCheckin = mode === 'checkin';

  const checkInDisplay = log.check_in_time
    ? format(parseISO(log.check_in_time), 'hh:mm a')
    : '—';

  const currentCheckoutDisplay = log.check_out_time
    ? format(parseISO(log.check_out_time), 'hh:mm a')
    : '—';

  const handleSubmit = async () => {
    if (!newTime) {
      toast.error(`Please enter the ${isCheckin ? 'check-in' : 'checkout'} time`);
      return;
    }
    if (!reason.trim()) {
      toast.error('Please provide a reason for the correction');
      return;
    }

    const logDate = parseISO(log.date);
    const [hours, minutes] = newTime.split(':').map(Number);
    const correctedDate = new Date(logDate);
    correctedDate.setHours(hours, minutes, 0, 0);

    if (isCheckin) {
      // Check-in cannot be in the future
      if (correctedDate > new Date()) {
        toast.error('Check-in time cannot be in the future');
        return;
      }
      // If checkout exists, check-in must be before checkout
      if (log.check_out_time && correctedDate >= new Date(log.check_out_time)) {
        toast.error('Check-in time must be before checkout time');
        return;
      }
    } else {
      // Checkout validation
      if (log.check_in_time && correctedDate <= new Date(log.check_in_time)) {
        toast.error('Checkout time must be after check-in time');
        return;
      }
      if (correctedDate > new Date()) {
        toast.error('Checkout time cannot be in the future');
        return;
      }
    }

    setSaving(true);
    try {
      await submitRequest({
        attendance_log_id: log.id,
        employee_id: log.employee_id,
        current_check_in_time: log.check_in_time,
        current_check_out_time: log.check_out_time,
        requested_check_in_time: isCheckin ? correctedDate.toISOString() : log.check_in_time,
        requested_check_out_time: isCheckin ? log.check_out_time : correctedDate.toISOString(),
        reason: reason.trim(),
      });

      toast.success('Correction request sent to HR for approval ✅');
      onOpenChange(false);
      onSubmitted();
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            {isCheckin ? 'Request Check-In Correction' : 'Request Checkout Correction'}
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
                <Clock className="h-3 w-3" /> Check-in
              </p>
              <p className={`text-sm font-semibold ${isCheckin ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                {checkInDisplay}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Checkout
              </p>
              <p className={`text-sm font-semibold ${!isCheckin ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                {currentCheckoutDisplay}
              </p>
            </div>
          </div>

          {/* Editable time */}
          <div className="space-y-1.5">
            <Label htmlFor="corrected-time" className="text-sm">
              {isCheckin ? 'Actual Check-In Time' : 'Actual Checkout Time'}
            </Label>
            <Input
              id="corrected-time"
              type="time"
              value={newTime}
              onChange={e => setNewTime(e.target.value)}
              className="h-10"
            />
          </div>

          {/* Reason (mandatory) */}
          <div className="space-y-1.5">
            <Label htmlFor="correction-reason" className="text-sm">
              Reason for Correction <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="correction-reason"
              placeholder={isCheckin
                ? 'e.g. Forgot to check in, was present from 9 AM...'
                : 'e.g. Forgot to check out, was working until 7 PM...'}
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
            disabled={saving || !newTime || !reason.trim()}
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
