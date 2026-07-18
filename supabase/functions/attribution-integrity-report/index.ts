import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Daily integrity report for sales attribution locks.
// Lists locked orders where attributed_by_name is null OR the attributor
// is not in the approved reviewer set (admins / sales_managers).
// Auth: X-Cron-Secret header (matches CRON_SECRET), or service-role JWT.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const provided = req.headers.get('x-cron-secret') ?? '';
  const auth = req.headers.get('authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const isCron = cronSecret && provided && provided === cronSecret;
  const isService = serviceKey && auth === `Bearer ${serviceKey}`;
  if (!isCron && !isService) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: rows, error } = await supabase
    .from('attribution_integrity_violations')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('attribution-integrity-report query failed', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const missing = (rows ?? []).filter((r: any) => r.issue === 'missing_attributor');
  const notAuth = (rows ?? []).filter((r: any) => r.issue === 'attributor_not_authorized_reviewer');

  // Persist a summary to security_audit_log so the run is discoverable.
  await supabase.from('security_audit_log').insert({
    user_id: null,
    user_name: 'system:attribution-integrity-report',
    action: 'attribution_integrity_scan',
    target_user_id: null,
    details: {
      total: rows?.length ?? 0,
      missing_attributor: missing.length,
      attributor_not_authorized: notAuth.length,
      sample_orders: (rows ?? []).slice(0, 10).map((r: any) => ({
        order_id: r.order_id,
        order_number: r.order_number,
        issue: r.issue,
        attributed_by: r.attributed_by,
      })),
    },
    ip_address: null,
    user_agent: 'cron',
  });

  return new Response(
    JSON.stringify({
      generated_at: new Date().toISOString(),
      total: rows?.length ?? 0,
      missing_attributor: missing.length,
      attributor_not_authorized: notAuth.length,
      violations: rows ?? [],
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});