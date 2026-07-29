// Admin-only endpoint to re-enqueue an email that ended up in the DLQ.
// Reads the original enqueued payload from the email_dlq_alert notification
// metadata (populated by process-email-queue) and pushes a fresh copy back
// onto the correct pgmq queue with new message_id / idempotency_key /
// queued_at values so it gets one clean delivery attempt.
//
// Auth: caller must be an authenticated admin. Only fields we control on
// the notification row are used — the client cannot inject arbitrary
// payload content.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !supabaseAnon || !supabaseServiceKey) {
    return json({ error: 'Server misconfigured' }, 500)
  }

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Unauthorized' }, 401)

  // Verify the user + admin role using the anon client with the caller's JWT.
  const authed = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userRes, error: userErr } = await authed.auth.getUser()
  if (userErr || !userRes?.user) return json({ error: 'Unauthorized' }, 401)
  const userId = userRes.user.id

  const admin = createClient(supabaseUrl, supabaseServiceKey)
  const { data: hasAdmin, error: roleErr } = await admin.rpc('has_role', {
    _user_id: userId,
    _role: 'admin',
  })
  if (roleErr) {
    console.error('has_role check failed', { error: roleErr })
    return json({ error: 'Role check failed' }, 500)
  }
  if (!hasAdmin) return json({ error: 'Admin role required' }, 403)

  let body: { notification_id?: string; event_index?: number }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const notificationId = body.notification_id
  const eventIndex = typeof body.event_index === 'number' ? body.event_index : 0
  if (!notificationId) return json({ error: 'notification_id is required' }, 400)

  const { data: notif, error: notifErr } = await admin
    .from('notifications')
    .select('id, type, metadata')
    .eq('id', notificationId)
    .maybeSingle()
  if (notifErr || !notif) return json({ error: 'Notification not found' }, 404)
  if (notif.type !== 'email_dlq_alert') {
    return json({ error: 'Notification is not an email delivery alert' }, 400)
  }
  const events = ((notif.metadata as Record<string, unknown>)?.events as Array<Record<string, unknown>>) || []
  const evt = events[eventIndex]
  if (!evt) return json({ error: 'Event not found on notification' }, 404)

  const queue = String((evt.queue as string) || 'transactional_emails')
  const stored = (evt.payload as Record<string, unknown>) || {}
  const recipient = (stored.to as string) || (evt.recipient as string)
  if (!recipient) return json({ error: 'Recipient missing from stored payload' }, 400)

  // Fresh identifiers so retries don't collide with the original.
  const newMessageId = crypto.randomUUID()
  const template = String((stored.label as string) || (evt.template as string) || 'transactional')
  const newIdempotencyKey = `resend:${template}:${notificationId}:${eventIndex}:${Date.now()}`

  const payload: Record<string, unknown> = {
    ...stored,
    to: recipient,
    message_id: newMessageId,
    idempotency_key: newIdempotencyKey,
    queued_at: new Date().toISOString(),
    resent_from_notification_id: notificationId,
  }

  // Pre-render is required by the platform queue — the stored payload
  // already contains html/text/subject from the original enqueue.
  if (!payload.html && !payload.text) {
    return json(
      {
        error:
          'Original rendered email body is no longer available. Resend from the order instead.',
      },
      409,
    )
  }

  const { error: enqErr } = await admin.rpc('enqueue_email', {
    queue_name: queue,
    payload,
  })
  if (enqErr) {
    console.error('enqueue_email failed', { error: enqErr })
    return json({ error: 'Failed to enqueue email' }, 500)
  }

  await admin.from('email_send_log').insert({
    message_id: newMessageId,
    template_name: template,
    recipient_email: recipient,
    status: 'pending',
    error_message: `Manual resend by admin from notification ${notificationId}`,
  })

  return json({ ok: true, message_id: newMessageId, queue })
})
