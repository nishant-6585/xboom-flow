import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Clock, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
}

export function ProvisionalCorrectionModal({
  log,
  open,
  onOpenChange,
  onCorrected,
}: ProvisionalCorrectionModalProps) {
  const { user } = useAuth();
  const [newCheckoutTime, setNewCheckoutTime] = useState(() => {
    if (log.check_out_time) {
      return format(parseISO(log.check_out_time), 'HH:mm');
    }
    return '';
  });
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

    if (log.check_in_time && correctedDate <= new Date(log.check_in_time)) {
      toast.error('Checkout time must be after check-in time');
      return;
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
          working_hours: newWorkingHours,
        })
        .eq('id', log.id);

      if (error) throw error;

      await supabase.from('attendance_audit_log').insert({
        attendance_log_id: log.id,
        employee_id: log.employee_id,
        event_type: 'AUTO_CHECKOUT_CORRECTED',
        performed_by: user.id,
        old_checkout_time: oldCheckoutTime,
        new_checkout_time: correctedISO,
        notes: `Provisional checkout corrected. New working hours: ${newWorkingHours.toFixed(2)}h`,
        metadata: {
          old_working_hours: log.working_hours,
          new_working_hours: newWorkingHours,
          corrected_by_type: 'self',
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
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Correct Provisional Checkout
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !newCheckoutTime}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {saving ? 'Saving…' : 'Submit Correction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
