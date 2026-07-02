import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ShieldCheck, Clock, User, CalendarCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { AttendanceLog } from '@/hooks/useHR';

interface HRAttendanceEditModalProps {
  log: AttendanceLog | null;
  employeeName: string;
  employeeId: string;
  date: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

type AttendanceStatusOption = 'present' | 'absent' | 'half_day' | 'on_leave';

const STATUS_OPTIONS: { value: AttendanceStatusOption; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'half_day', label: 'Half Day' },
  { value: 'on_leave', label: 'On Leave' },
];

export function HRAttendanceEditModal({
  log,
  employeeName,
  employeeId,
  date,
  open,
  onOpenChange,
  onSaved,
}: HRAttendanceEditModalProps) {
  const { user, profile } = useAuth();
  const hasExistingLog = Boolean(log?.id);
  const isMissingAttendanceData = !log?.check_in_time;

  const [status, setStatus] = useState<AttendanceStatusOption>(() => {
    if (!log?.check_in_time) return 'present';
    return (log.status as AttendanceStatusOption) || 'present';
  });
  const [checkInTime, setCheckInTime] = useState(() =>
    log?.check_in_time ? format(parseISO(log.check_in_time), 'HH:mm') : '09:30'
  );
  const [checkOutTime, setCheckOutTime] = useState(() =>
    log?.check_out_time ? format(parseISO(log.check_out_time), 'HH:mm') : '18:30'
  );
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const buildDateTime = (timeStr: string) => {
    const logDate = parseISO(date);
    const [hours, minutes] = timeStr.split(':').map(Number);
    const dt = new Date(logDate);
    dt.setHours(hours, minutes, 0, 0);
    return dt;
  };

  // Overnight support: if checkout appears before check-in on the same date,
  // treat it as the next calendar day (e.g. checkout at 00:30 for a 09:56 check-in).
  const buildCheckoutDateTime = (timeStr: string, checkInDt: Date) => {
    const dt = buildDateTime(timeStr);
    if (dt <= checkInDt) {
      dt.setDate(dt.getDate() + 1);
    }
    return dt;
  };

  const handleSave = async () => {
    if (!user || !profile) return;
    if (!reason.trim()) {
      toast.error('Reason for modification is mandatory');
      return;
    }

    const needsTimes = status === 'present' || status === 'half_day';

    if (needsTimes) {
      if (!checkInTime) {
        toast.error('Check-in time is required for Present / Half Day status');
        return;
      }
      const ciDt = buildDateTime(checkInTime);
      if (checkOutTime) {
        const coDt = buildCheckoutDateTime(checkOutTime, ciDt);
        const diffHours = (coDt.getTime() - ciDt.getTime()) / (1000 * 60 * 60);
        if (diffHours > 24) {
          toast.error('Shift duration cannot exceed 24 hours');
          return;
        }
      }
    }

    setSaving(true);
    try {
      const userName = profile.name || 'HR User';
      const ciDt = needsTimes ? buildDateTime(checkInTime) : null;
      const checkInISO = ciDt ? ciDt.toISOString() : null;
      const checkOutISO = needsTimes && checkOutTime && ciDt
        ? buildCheckoutDateTime(checkOutTime, ciDt).toISOString()
        : null;

      let workingHours: number | null = null;
      if (checkInISO && checkOutISO) {
        const totalMs = new Date(checkOutISO).getTime() - new Date(checkInISO).getTime();
        workingHours = Math.max(0, totalMs / (1000 * 60 * 60));
      }

      const oldStatus = log?.status || 'absent';
      const oldCheckIn = log?.check_in_time || null;
      const oldCheckOut = log?.check_out_time || null;

      if (!hasExistingLog) {
        // Create new attendance log
        const { data: inserted, error } = await supabase
          .from('attendance_logs')
          .insert({
            employee_id: employeeId,
            date,
            check_in_time: checkInISO,
            check_out_time: checkOutISO,
            status,
            source: 'hr_manual',
            notes: `HR override by ${userName}: ${reason}`,
            corrected_by: user.id,
            corrected_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (error) throw error;

        // Write audit log
        await supabase.from('attendance_audit_log').insert({
          attendance_log_id: inserted.id,
          employee_id: employeeId,
          event_type: 'HR_MANUAL_ENTRY',
          performed_by: user.id,
          performed_by_name: userName,
          notes: `HR created attendance record. Status: ${status}. Reason: ${reason}`,
          new_checkout_time: checkOutISO,
          metadata: {
            action: 'hr_manual_entry',
            new_status: status,
            check_in_time: checkInISO,
            check_out_time: checkOutISO,
            working_hours: workingHours,
            reason,
            performed_by_name: userName,
          },
        });
      } else {
        // Update existing log
        const updatePayload: Record<string, any> = {
          status,
          corrected_by: user.id,
          corrected_at: new Date().toISOString(),
          notes: `HR override by ${userName}: ${reason}`,
        };

        if (needsTimes) {
          updatePayload.check_in_time = checkInISO;
          updatePayload.check_out_time = checkOutISO;
          if (log?.is_provisional_checkout) {
            updatePayload.is_provisional_checkout = false;
          }
        } else {
          updatePayload.check_in_time = null;
          updatePayload.check_out_time = null;
        }

        const { error } = await supabase
          .from('attendance_logs')
          .update(updatePayload)
          .eq('id', log!.id);

        if (error) throw error;

        // Build audit details
        const changes: string[] = [];
        if (oldStatus !== status) changes.push(`Status: ${oldStatus} → ${status}`);
        if (oldCheckIn !== checkInISO) changes.push(`Check-in: ${oldCheckIn ? format(new Date(oldCheckIn), 'hh:mm a') : '—'} → ${checkInISO ? format(new Date(checkInISO), 'hh:mm a') : '—'}`);
        if (oldCheckOut !== checkOutISO) changes.push(`Check-out: ${oldCheckOut ? format(new Date(oldCheckOut), 'hh:mm a') : '—'} → ${checkOutISO ? format(new Date(checkOutISO), 'hh:mm a') : '—'}`);

        await supabase.from('attendance_audit_log').insert({
          attendance_log_id: log!.id,
          employee_id: employeeId,
          event_type: 'HR_ATTENDANCE_EDIT',
          performed_by: user.id,
          performed_by_name: userName,
          old_checkout_time: oldCheckOut,
          new_checkout_time: checkOutISO,
          notes: `HR edited attendance. ${changes.join('. ')}. Reason: ${reason}`,
          metadata: {
            action: 'hr_attendance_edit',
            old_status: oldStatus,
            new_status: status,
            old_check_in: oldCheckIn,
            new_check_in: checkInISO,
            old_check_out: oldCheckOut,
            new_check_out: checkOutISO,
            old_working_hours: log?.working_hours,
            new_working_hours: workingHours,
            reason,
            performed_by_name: userName,
          },
        });
      }

      toast.success(`Attendance ${hasExistingLog ? 'updated' : 'created'} successfully ✅`);
      onSaved();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save attendance edit');
    } finally {
      setSaving(false);
    }
  };

  const needsTimes = status === 'present' || status === 'half_day';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-500" />
            Edit Attendance
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Admin notice */}
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-3 py-2.5">
            <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-400">
              You are making an <strong>administrative attendance edit</strong> for <strong>{employeeName}</strong>. This action will be fully logged in the audit trail.
            </p>
          </div>

          {/* Date display */}
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">{format(parseISO(date), 'EEEE, dd MMM yyyy')}</p>
            {isMissingAttendanceData && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-300 bg-red-50 text-red-700">
                No Record
              </Badge>
            )}
          </div>

          {/* Current values if editing */}
          {hasExistingLog && log && (
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Current Status</p>
                <p className="font-medium capitalize">{log.status || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Check-in</p>
                <p className="font-medium">{log.check_in_time ? format(new Date(log.check_in_time), 'hh:mm a') : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Check-out</p>
                <p className="font-medium">{log.check_out_time ? format(new Date(log.check_out_time), 'hh:mm a') : '—'}</p>
              </div>
            </div>
          )}

          {/* Status selector */}
          <div className="space-y-1.5">
            <Label className="text-sm">Attendance Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AttendanceStatusOption)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time fields - only for Present/Half Day */}
          {needsTimes && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hr-checkin" className="text-sm flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Check-in Time
                </Label>
                <Input
                  id="hr-checkin"
                  type="time"
                  value={checkInTime}
                  onChange={e => setCheckInTime(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr-checkout" className="text-sm flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Check-out Time
                </Label>
                <Input
                  id="hr-checkout"
                  type="time"
                  value={checkOutTime}
                  onChange={e => setCheckOutTime(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          )}

          {/* Mandatory reason */}
          <div className="space-y-1.5">
            <Label htmlFor="hr-reason" className="text-sm">
              Reason for Modification <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="hr-reason"
              placeholder="e.g. Employee was on field visit and unable to mark attendance"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              className="resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">
              This reason will be recorded in the audit trail alongside your identity.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !reason.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? 'Saving…' : hasExistingLog ? 'Save Changes' : 'Create Record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
