import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';

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

/**
 * Fire-and-forget email notification for a comp-off approve/reject action.
 * The in-app notification row is created inside the DB RPC (SECURITY DEFINER),
 * this only takes care of the transactional email side.
 *
 * Errors are logged but never thrown — we don't want a mail hiccup to
 * break the HR approval flow.
 */
export async function sendCompoffDecisionEmail(input: CompoffDecisionEmailInput) {
  try {
    const { data: emp } = await supabase
      .from('employees')
      .select('name, personal_email')
      .eq('id', input.employee_id)
      .maybeSingle();

    const to = emp?.personal_email?.trim();
    if (!to) return; // no email on file — nothing to send

    const earnedFmt = (() => {
      try { return format(parseISO(input.earned_date), 'MMM d, yyyy'); }
      catch { return input.earned_date; }
    })();

    await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'compoff-decision',
        recipientEmail: to,
        idempotencyKey: `compoff-${input.decision}-${input.ledger_id}`,
        templateData: {
          name: emp?.name || '',
          decision: input.decision,
          earned_date: earnedFmt,
          earned_type: input.earned_type || '',
          actor_name: input.actor_name || 'HR',
          comment: input.comment || '',
          reason: input.reason || '',
        },
      },
    });
  } catch (err) {
    console.warn('sendCompoffDecisionEmail failed', err);
  }
}