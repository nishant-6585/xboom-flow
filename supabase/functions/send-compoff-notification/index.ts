import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// HR-gated relay: takes a compoff_notification_log row id, derives recipient
// and content server-side, and invokes send-transactional-email using the
// service-role key. Never trust the caller for recipient/content — an HR JWT
// must not be able to email arbitrary addresses through the platform pipeline.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401)
  }
  const jwt = authHeader.slice(7)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(jwt)
  if (claimsErr || !claimsData?.claims?.sub) {
    return json({ error: 'Unauthorized' }, 401)
  }
  const callerId = claimsData.claims.sub as string

  const svc = createClient(supabaseUrl, serviceKey)

  // Role check: hr or admin
  const { data: isHr } = await svc.rpc('has_role', { _user_id: callerId, _role: 'hr' })
  const { data: isAdmin } = await svc.rpc('has_role', { _user_id: callerId, _role: 'admin' })
  if (!isHr && !isAdmin) {
    return json({ error: 'Forbidden: HR or admin only' }, 403)
  }

  let log_id: string
  try {
    const body = await req.json()
    log_id = body?.log_id
    if (!log_id || typeof log_id !== 'string') throw new Error('log_id required')
  } catch (e: any) {
    return json({ error: e?.message || 'Invalid body' }, 400)
  }

  const { data: log, error: logErr } = await svc
    .from('compoff_notification_log')
    .select('id, ledger_id, employee_id, decision, comment, reason, actor_name, attempts')
    .eq('id', log_id)
    .maybeSingle()
  if (logErr || !log) return json({ error: 'Log row not found' }, 404)

  const { data: ledger } = await svc
    .from('compoff_ledger')
    .select('earned_date, earned_type')
    .eq('id', log.ledger_id)
    .maybeSingle()

  const { data: emp } = await svc
    .from('employees')
    .select('name, personal_email')
    .eq('id', log.employee_id)
    .maybeSingle()

  const recipient = emp?.personal_email?.trim() || null
  const attempts = (log.attempts || 0)

  if (!recipient) {
    await svc.from('compoff_notification_log')
      .update({ status: 'skipped', last_error: 'No personal_email on employee record' })
      .eq('id', log.id)
    return json({ skipped: 'no_email' }, 200)
  }

  const earnedFmt = ledger?.earned_date
    ? new Date(ledger.earned_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        templateName: 'compoff-decision',
        recipientEmail: recipient,
        idempotencyKey: `compoff-${log.decision}-${log.ledger_id}-${attempts}`,
        interactive: true,
        templateData: {
          name: emp?.name || '',
          decision: log.decision,
          earned_date: earnedFmt,
          earned_type: ledger?.earned_type || '',
          actor_name: log.actor_name || 'HR',
          comment: log.comment || '',
          reason: log.reason || '',
        },
      }),
    })
    const text = await resp.text()
    if (!resp.ok) throw new Error(`send-transactional-email ${resp.status}: ${text.slice(0, 300)}`)

    await svc.from('compoff_notification_log')
      .update({ status: 'sent', last_error: null })
      .eq('id', log.id)
    return json({ status: 'sent' }, 200)
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.warn('send-compoff-notification failed', msg)
    await svc.from('compoff_notification_log')
      .update({ status: 'failed', last_error: msg })
      .eq('id', log.id)
    return json({ status: 'failed', error: msg }, 200)
  }
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}