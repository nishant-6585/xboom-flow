import { supabase } from '@/integrations/supabase/client';

export interface CompoffDecisionEmailInput {
  ledger_id: string;
  employee_id: string;
  earned_date: string; // ISO date
  earned_type?: string | null;
  decision: 'approved' | 'rejected';
  comment?: string | null;
  reason?: string | null;
  actor_name?: string | null;
}

export type CompoffEmailStatus = 'sent' | 'failed' | 'skipped';

/**
 * Send the comp-off approve/reject email and log the attempt in
 * `compoff_notification_log` so HR can see failures and retry.
 * Never throws — the HR flow keeps working even if email is down.
 */
export async function sendCompoffDecisionEmail(
  input: CompoffDecisionEmailInput,
): Promise<{ status: CompoffEmailStatus; error?: string }> {
  const { data: userRes } = await supabase.auth.getUser();
  const actorId = userRes?.user?.id ?? null;

  // Look up recipient
  let recipient: string | null = null;
  let empName = '';
  try {
    const { data: emp } = await supabase
      .from('employees')
      .select('name, personal_email')
      .eq('id', input.employee_id)
      .maybeSingle();
    recipient = emp?.personal_email?.trim() || null;
    empName = emp?.name || '';
  } catch (err) {
    console.warn('compoffNotify: employee lookup failed', err);
  }

  // Try to reuse an existing pending/failed log row for this ledger+decision
  const { data: existing } = await supabase
    .from('compoff_notification_log')
    .select('id, attempts')
    .eq('ledger_id', input.ledger_id)
    .eq('decision', input.decision)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let logId = existing?.id as string | undefined;
  const nextAttempts = (existing?.attempts || 0) + 1;
  if (!logId) {
    const { data: created } = await supabase
      .from('compoff_notification_log')
      .insert({
        ledger_id: input.ledger_id,
        employee_id: input.employee_id,
        recipient_email: recipient,
        decision: input.decision,
        status: 'pending',
        attempts: 1,
        comment: input.comment || null,
        reason: input.reason || null,
        actor_id: actorId,
        actor_name: input.actor_name || null,
      })
      .select('id')
      .maybeSingle();
    logId = created?.id;
  } else {
    await supabase
      .from('compoff_notification_log')
      .update({
        status: 'pending',
        attempts: nextAttempts,
        recipient_email: recipient,
        comment: input.comment || null,
        reason: input.reason || null,
        actor_id: actorId,
        actor_name: input.actor_name || null,
        last_error: null,
      })
      .eq('id', logId);
  }

  if (!recipient) {
    if (logId) await supabase.from('compoff_notification_log')
      .update({ status: 'skipped', last_error: 'No personal_email on employee record' })
      .eq('id', logId);
    return { status: 'skipped', error: 'No personal_email on employee record' };
  }

  if (!logId) {
    return { status: 'failed', error: 'Could not create notification log row' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('send-compoff-notification', {
      body: { log_id: logId },
    });
    if (error) throw error;
    if ((data as any)?.skipped === 'no_email') {
      return { status: 'skipped', error: 'No personal_email on employee record' };
    }
    if ((data as any)?.status === 'failed') {
      return { status: 'failed', error: (data as any)?.error || 'Send failed' };
    }
    return { status: 'sent' };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn('sendCompoffDecisionEmail failed', msg);
    await supabase.from('compoff_notification_log')
      .update({ status: 'failed', last_error: msg })
      .eq('id', logId);
    return { status: 'failed', error: msg };
  }
}

export interface CompoffNotifLogRow {
  id: string;
  ledger_id: string;
  employee_id: string;
  recipient_email: string | null;
  decision: 'approved' | 'rejected';
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  last_error: string | null;
  comment: string | null;
  reason: string | null;
  actor_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Retry a previously failed email using the stored context. */
export async function retryCompoffDecisionEmail(row: CompoffNotifLogRow) {
  try {
    const { data, error } = await supabase.functions.invoke('send-compoff-notification', {
      body: { log_id: row.id },
    });
    if (error) throw error;
    if ((data as any)?.skipped === 'no_email') {
      return { status: 'skipped' as CompoffEmailStatus, error: 'No personal_email on employee record' };
    }
    if ((data as any)?.status === 'failed') {
      return { status: 'failed' as CompoffEmailStatus, error: (data as any)?.error || 'Send failed' };
    }
    return { status: 'sent' as CompoffEmailStatus };
  } catch (err: any) {
    const msg = err?.message || String(err);
    await supabase.from('compoff_notification_log')
      .update({ status: 'failed', last_error: msg })
      .eq('id', row.id);
    return { status: 'failed' as CompoffEmailStatus, error: msg };
  }
}