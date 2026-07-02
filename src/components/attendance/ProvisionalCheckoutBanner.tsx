import { useState } from 'react';
import { format, subDays, parseISO } from 'date-fns';
import { AlertTriangle, Clock, CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { AttendanceLog } from '@/hooks/useHR';
import { cn } from '@/lib/utils';

interface ProvisionalCheckoutBannerProps {
  yesterdayLog: AttendanceLog | null;
  onCorrected: () => void;
}

/**
 * Shows a banner when yesterday's checkout was auto-marked as provisional.
 * Allows the employee to submit a correction until 11:59 PM of the current day.
 */
export function ProvisionalCheckoutBanner({ yesterdayLog, onCorrected }: ProvisionalCheckoutBannerProps) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [newCheckoutTime, setNewCheckoutTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Only show if yesterday's log is provisional
  if (!yesterdayLog || !yesterdayLog.is_provisional_checkout || dismissed) return null;

  // Correction window: until 11:59 PM of today
  const now = new Date();
  const correctionDeadline = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  if (now > correctionDeadline) return null;

  const autoCheckoutDisplay = yesterdayLog.check_out_time
    ? format(parseISO(yesterdayLog.check_out_time), 'hh:mm a')
    : '—';

  const yesterday = format(subDays(new Date(), 1), 'dd MMM yyyy');

  const handleCorrect = async () => {
    if (!newCheckoutTime || !yesterdayLog || !user) return;

    // Build full datetime from yesterday's date + new time input
    const [hours, minutes] = newCheckoutTime.split(':').map(Number);
    const correctedDate = subDays(new Date(), 1);
    correctedDate.setHours(hours, minutes, 0, 0);

    // Overnight support: if the entered time falls before check-in, treat it
    // as the next calendar day (e.g. worked past midnight).
    if (yesterdayLog.check_in_time) {
      const checkInDt = new Date(yesterdayLog.check_in_time);
      if (correctedDate <= checkInDt) {
        correctedDate.setDate(correctedDate.getDate() + 1);
      }
      const diffHours = (correctedDate.getTime() - checkInDt.getTime()) / (1000 * 60 * 60);
      if (diffHours > 24) {
        toast.error('Shift duration cannot exceed 24 hours');
        return;
      }
    }

    // Validate: cannot be in the future
    if (correctedDate > new Date()) {
      toast.error('Checkout time cannot be in the future');
      return;
    }

    setSaving(true);
    try {
      const oldCheckoutTime = yesterdayLog.check_out_time;
      const correctedISO = correctedDate.toISOString();

      // Recalculate working hours
      const checkInTime = new Date(yesterdayLog.check_in_time!);
      const totalMs = correctedDate.getTime() - checkInTime.getTime();
      const breakMs = (yesterdayLog.total_break_minutes || 0) * 60 * 1000;
      const newWorkingHours = Math.max(0, (totalMs - breakMs) / (1000 * 60 * 60));

      const { error } = await supabase
        .from('attendance_logs')
        .update({
          check_out_time: correctedISO,
          is_provisional_checkout: false,
          corrected_by: user.id,
          corrected_at: new Date().toISOString(),
        })
        .eq('id', yesterdayLog.id);

      if (error) throw error;

      // Write audit log
      await supabase
        .from('attendance_audit_log')
        .insert({
          attendance_log_id: yesterdayLog.id,
          employee_id: yesterdayLog.employee_id,
          event_type: 'AUTO_CHECKOUT_CORRECTED',
          performed_by: user.id,
          old_checkout_time: oldCheckoutTime,
          new_checkout_time: correctedISO,
          notes: `Employee self-corrected provisional checkout. New working hours: ${newWorkingHours.toFixed(2)}h`,
          metadata: {
            old_working_hours: yesterdayLog.working_hours,
            new_working_hours: newWorkingHours,
            corrected_by_type: 'self',
          },
        });

      toast.success('Checkout time corrected successfully ✅');
      setEditing(false);
      onCorrected();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save correction');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-4 space-y-3">
      {/* Dismiss button */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-amber-500 hover:text-amber-700 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Header */}
      <div className="flex items-start gap-3 pr-6">
        <div className="shrink-0 mt-0.5">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Provisional Checkout — {yesterday}
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
            Your checkout was auto-marked at <strong>{autoCheckoutDisplay}</strong> by the system.
            If you worked beyond that time, you can update it below.
          </p>
        </div>
      </div>

      {/* Quick info */}
      <div className="flex flex-wrap gap-3 text-xs text-amber-700 dark:text-amber-400">
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          Check-in: {yesterdayLog.check_in_time ? format(parseISO(yesterdayLog.check_in_time), 'hh:mm a') : '—'}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          Auto checkout: {autoCheckoutDisplay}
        </span>
        <span className="flex items-center gap-1">
          <CheckCircle className="h-3.5 w-3.5" />
          Correction window open until midnight tonight
        </span>
      </div>

      {/* Correction form */}
      {!editing ? (
        <Button
          variant="outline"
          size="sm"
          className="border-amber-400 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 h-8 text-xs"
          onClick={() => {
            // Pre-fill with auto-checkout time for convenience
            if (yesterdayLog.check_out_time) {
              const t = parseISO(yesterdayLog.check_out_time);
              setNewCheckoutTime(format(t, 'HH:mm'));
            }
            setEditing(true);
          }}
        >
          Update My Checkout Time
        </Button>
      ) : (
        <div className="flex flex-wrap items-end gap-3 pt-1">
          <div className="space-y-1">
            <Label className="text-xs text-amber-700 dark:text-amber-400">
              Actual checkout time (yesterday)
            </Label>
            <Input
              type="time"
              value={newCheckoutTime}
              onChange={e => setNewCheckoutTime(e.target.value)}
              className="h-8 text-sm w-36 border-amber-300 focus-visible:ring-amber-500"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleCorrect}
              disabled={saving || !newCheckoutTime}
            >
              {saving ? 'Saving…' : 'Save Correction'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
