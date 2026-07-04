import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const WEBHOOK_SECRET = Deno.env.get('ZOHO_WEBHOOK_SECRET');

function toDate(v: unknown): string | null {
  if (!v || typeof v !== 'string') return null;
  return v.length >= 10 ? v.slice(0, 10) : null;
}
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Simple shared-secret auth via query param (?token=...) or header
    const url = new URL(req.url);
    const token = url.searchParams.get('token') ?? req.headers.get('x-webhook-secret');
    if (WEBHOOK_SECRET && token !== WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contentType = req.headers.get('content-type') ?? '';
    let payload: any;
    if (contentType.includes('application/json')) {
      payload = await req.json();
    } else {
      // Zoho x-www-form-urlencoded default: field "payload" contains JSON string
      const form = await req.formData();
      const raw = form.get('payload');
      payload = raw ? JSON.parse(String(raw)) : Object.fromEntries(form as any);
    }

    // Zoho sends either the invoice object directly, or wrapped as { invoice: {...} }
    const inv = payload?.invoice ?? payload;
    if (!inv?.invoice_id) {
      await supabase.from('webhook_debug_logs').insert({
        source: 'zoho-invoice-webhook',
        payload,
        note: 'missing invoice_id',
      }).catch(() => {});
      return new Response(JSON.stringify({ error: 'invoice_id missing' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const row = {
      invoice_id: String(inv.invoice_id),
      organization_id: inv.organization_id ? String(inv.organization_id) : null,
      invoice_number: inv.invoice_number ?? null,
      customer_id: inv.customer_id ? String(inv.customer_id) : null,
      customer_name: inv.customer_name ?? null,
      status: inv.status ?? null,
      date: toDate(inv.date),
      due_date: toDate(inv.due_date),
      currency_code: inv.currency_code ?? null,
      total: toNum(inv.total),
      balance: toNum(inv.balance),
      reference_number: inv.reference_number ?? null,
      created_time: inv.created_time ?? null,
      last_modified_time: inv.last_modified_time ?? null,
      raw: inv,
      synced_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('zoho_books_invoices')
      .upsert(row, { onConflict: 'invoice_id' });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, invoice_id: row.invoice_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('zoho-invoice-webhook error', e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});