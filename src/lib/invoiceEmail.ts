import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface InvoiceEmailLog {
  id: string;
  invoice_id: string;
  to_email: string | null;
  status: 'sent' | 'failed' | 'skipped';
  bypass_reason: string | null;
  error: string | null;
  attempted_at: string;
}

export interface SendInvoiceEmailArgs {
  invoice_id: string;
  to_email?: string;
  mode?: 'auto' | 'manual' | 'skip';
  bypass_reason?: string;
  force?: boolean;
  /** When true, suppress error toast (caller handles). */
  silent?: boolean;
}

export async function sendInvoiceEmail(args: SendInvoiceEmailArgs): Promise<{
  ok: boolean;
  skipped?: boolean;
  deduped?: boolean;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('send-invoice-email', {
      body: {
        invoice_id: args.invoice_id,
        to_email: args.to_email,
        mode: args.mode || 'auto',
        bypass_reason: args.bypass_reason,
        force: args.force,
      },
    });
    if (error) {
      // edge function returned non-2xx
      const msg = (error as any)?.message || 'Email send failed';
      if (!args.silent) toast.error(`Invoice email failed: ${msg}`);
      return { ok: false, error: msg };
    }
    if ((data as any)?.skipped) return { ok: true, skipped: true };
    if ((data as any)?.deduped) return { ok: true, deduped: true };
    if (args.mode === 'manual') toast.success('Invoice email sent');
    else toast.success('Invoice emailed to customer');
    return { ok: true };
  } catch (err: any) {
    if (!args.silent) toast.error(`Invoice email failed: ${err.message || err}`);
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function fetchInvoiceEmailLogs(invoiceIds: string[]): Promise<Record<string, InvoiceEmailLog>> {
  if (invoiceIds.length === 0) return {};
  const { data, error } = await (supabase.from('invoice_email_log') as any)
    .select('id,invoice_id,to_email,status,bypass_reason,error,attempted_at')
    .in('invoice_id', invoiceIds)
    .order('attempted_at', { ascending: false });
  if (error || !data) return {};
  const latest: Record<string, InvoiceEmailLog> = {};
  for (const row of data as InvoiceEmailLog[]) {
    if (!latest[row.invoice_id]) latest[row.invoice_id] = row;
  }
  return latest;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isValidEmail = (e: string | null | undefined) => !!e && EMAIL_RE.test(e.trim());

export const BYPASS_REASONS = [
  'Customer pickup – no email',
  'Customer requested no email',
  'Email will be sent manually',
  'Internal/test order',
];