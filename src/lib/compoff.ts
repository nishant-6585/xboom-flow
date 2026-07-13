import { supabase } from '@/integrations/supabase/client';

/**
 * Translate raw Postgres/RPC error messages from claim_compoff_credit
 * into short, actionable text for end-users.
 */
export function friendlyCompoffError(raw?: string | null): string {
  const msg = (raw || '').toString();
  if (!msg) return 'Could not submit comp-off request. Please try again.';

  if (/Not authenticated/i.test(msg)) {
    return 'Your session has expired — please sign in again.';
  }
  if (/Employee record not found/i.test(msg)) {
    return 'We could not find your employee record. Contact HR.';
  }
  if (/Earned date cannot be in the future/i.test(msg)) {
    return 'You cannot claim comp-off for a future date.';
  }
  if (/more than 90 days old/i.test(msg)) {
    return 'This day is more than 90 days old — the claim window has closed. Please contact HR if this is an exception.';
  }
  if (/is not a weekend/i.test(msg)) {
    return 'The selected date is not a Saturday or Sunday. Comp-off can only be earned for weekend work.';
  }
  if (/No holiday found/i.test(msg)) {
    return 'This date is not marked as a company holiday. Please pick a listed holiday, or switch to the “Worked on a Weekend” tab.';
  }
  if (/No attendance record found/i.test(msg)) {
    return 'No check-in was recorded for this date. Comp-off can only be claimed for days you actually worked — please contact HR if this is missing.';
  }
  if (/row-level security/i.test(msg)) {
    return 'You do not have permission to create this comp-off credit. Please contact HR.';
  }
  // Fallback: strip the SQL "ERROR: " prefix if present
  return msg.replace(/^ERROR:\s*/i, '');
}

/**
 * Preflight: does the current user have a check-in on the given date?
 * Used by the apply dialog to warn before submit so users see the
 * problem inline (rather than as a toast after a rejected RPC).
 */
export async function hasAttendanceForDate(
  employeeId: string,
  earnedDate: string,
): Promise<boolean> {
  if (!employeeId || !earnedDate) return false;
  const { data, error } = await supabase
    .from('attendance_logs')
    .select('id, check_in_time')
    .eq('employee_id', employeeId)
    .eq('date', earnedDate)
    .not('check_in_time', 'is', null)
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return !!data;
}