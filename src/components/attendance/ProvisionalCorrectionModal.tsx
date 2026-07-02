import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { AttendanceLog } from '@/hooks/useHR';

interface ProvisionalCorrectionModalProps {
  log: AttendanceLog;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCorrected: () => void;
  /** When true, shows the HR/Admin override UI with mandatory reason note */
  isAdminCorrection?: boolean;
}

export function ProvisionalCorrectionModal({
  log,
  open,
  onOpenChange,
  onCorrected,
  isAdminCorrection = false,
}: ProvisionalCorrectionModalProps) {
  const { user } = useAuth();
  const [newCheckoutTime, setNewCheckoutTime] = useState(() => {
    if (log.check_out_time) {
      return format(parseISO(log.check_out_time), 'HH:mm');
    }
    return '';
  });
  const [adminNote, setAdminNote] = useState('');
  const [saving, setSaving] = useState(false);

  const checkInDisplay = log.check_in_time
    ? format(parseISO(log.check_in_time), 'hh:mm a')
    : '—';

  const provisionalDisplay = log.check_out_time
    ? format(parseISO(log.check_out_time), 'hh:mm a')
    : '—';

  const handleSubmit = async () => {
    if (!newCheckoutTime || !user) return;

    const logDate = parseISO(log.date);
    const [hours, minutes] = newCheckoutTime.split(':').map(Number);
    const correctedDate = new Date(logDate);
    correctedDate.setHours(hours, minutes, 0, 0);

    // Overnight support: if checkout time falls before check-in on the same
    // date, treat it as the next calendar day.
    if (log.check_in_time) {
      const checkInDt = new Date(log.check_in_time);
      if (correctedDate <= checkInDt) {
        correctedDate.setDate(correctedDate.getDate() + 1);
      }
      const diffHours = (correctedDate.getTime() - checkInDt.getTime()) / (1000 * 60 * 60);
      if (diffHours > 24) {
        toast.error('Shift duration cannot exceed 24 hours');
        return;
      }
    }

    if (correctedDate > new Date()) {
      toast.error('Checkout time cannot be in the future');
      return;
    }

    setSaving(true);
    try {
      const oldCheckoutTime = log.check_out_time;
      const correctedISO = correctedDate.toISOString();

      const checkInTime = new Date(log.check_in_time!);
      const totalMs = correctedDate.getTime() - checkInTime.getTime();
      const breakMs = (log.total_break_minutes || 0) * 60 * 1000;
      const newWorkingHours = Math.max(0, (totalMs - breakMs) / (1000 * 60 * 60));

      const { error } = await supabase
        .from('attendance_logs')
        .update({
          check_out_time: correctedISO,
          is_provisional_checkout: false,
          corrected_by: user.id,
          corrected_at: new Date().toISOString(),
        })
        .eq('id', log.id);

      if (error) throw error;

      const correctionNote = isAdminCorrection
        ? `HR/Admin override correction. ${adminNote ? `Reason: ${adminNote}. ` : ''}New working hours: ${newWorkingHours.toFixed(2)}h`
        : `Provisional checkout corrected. New working hours: ${newWorkingHours.toFixed(2)}h`;

      await supabase.from('attendance_audit_log').insert({
        attendance_log_id: log.id,
        employee_id: log.employee_id,
        event_type: 'AUTO_CHECKOUT_CORRECTED',
        performed_by: user.id,
        old_checkout_time: oldCheckoutTime,
        new_checkout_time: correctedISO,
        notes: correctionNote,
        metadata: {
          old_working_hours: log.working_hours,
          new_working_hours: newWorkingHours,
          corrected_by_type: isAdminCorrection ? 'admin' : 'self',
          ...(isAdminCorrection && adminNote ? { admin_reason: adminNote } : {}),
        },
      });

      toast.success('Checkout time corrected successfully ✅');
      onOpenChange(false);
      onCorrected();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save correction');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isAdminCorrection
              ? <ShieldCheck className="h-4 w-4 text-blue-500" />
              : <AlertTriangle className="h-4 w-4 text-amber-500" />}
            {isAdminCorrection ? 'HR/Admin — Override Checkout' : 'Correct Provisional Checkout'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Admin override notice */}
          {isAdminCorrection && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-3 py-2.5">
              <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-400">
                You are making an <strong>administrative override</strong>. This action will be fully logged in the audit trail with your identity.
              </p>
            </div>
          )}

          {/* Date + badge */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">
              {format(parseISO(log.date), 'EEEE, dd MMM yyyy')}
            </p>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/30">
              Provisional
            </Badge>
          </div>

          {/* Current times read-only */}
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Check-in
              </p>
              <p className="text-sm font-semibold">{checkInDisplay}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Auto Checkout
              </p>
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">{provisionalDisplay}</p>
            </div>
          </div>

          {/* Editable checkout */}
          <div className="space-y-1.5">
            <Label htmlFor="corrected-checkout" className="text-sm">
              Actual Checkout Time
            </Label>
            <Input
              id="corrected-checkout"
              type="time"
              value={newCheckoutTime}
              onChange={e => setNewCheckoutTime(e.target.value)}
              className="h-10"
            />
            <p className="text-xs text-muted-foreground">
              Enter the time you actually finished working.
            </p>
          </div>

          {/* Admin reason note */}
          {isAdminCorrection && (
            <div className="space-y-1.5">
              <Label htmlFor="admin-note" className="text-sm">
                Reason for Override <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="admin-note"
                placeholder="e.g. Employee reported system issue, verified via CCTV logs..."
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                rows={2}
                className="resize-none text-sm"
              />
              <p className="text-xs text-muted-foreground">
                This note will be recorded in the audit log alongside your identity.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !newCheckoutTime}
            className={isAdminCorrection
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-amber-600 hover:bg-amber-700 text-white'}
          >
            {saving ? 'Saving…' : isAdminCorrection ? 'Apply Override' : 'Submit Correction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
