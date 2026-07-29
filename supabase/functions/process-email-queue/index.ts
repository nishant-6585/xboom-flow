import { sendLovableEmail } from 'npm:@lovable.dev/email-js'
import { createClient } from 'npm:@supabase/supabase-js@2'

import { buildDispatcherPayload } from './payload.ts'
import { sendEmail as sendMailSeam } from '../_shared/email.ts'

// A DLQ event captured for post-run notification. We batch these and emit
// ONE summary alert per invocation to avoid alert-flood on template outages
// (which is exactly the failure mode we just fixed for customer email).
interface DlqEvent {
  queue: string
  template: string
  recipient: string
  reason: string
  message_id: string | null
  idempotency_key?: string | null
  attempts?: number
  // Raw enqueued payload — kept so admins can resend the exact message
  // without needing to re-render the template. Sensitive fields are
  // stripped before we persist this on the notification.
  payload?: Record<string, unknown>
}

const MAX_RETRIES = 5
const DEFAULT_BATCH_SIZE = 10
const DEFAULT_SEND_DELAY_MS = 200
const DEFAULT_AUTH_TTL_MINUTES = 15
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60

// Check if an error is a rate-limit (429) response.
// Uses EmailAPIError.status when available (email-js >=0.x with structured errors),
// falls back to parsing the error message for older versions.
function isRateLimited(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 429
  }
  return error instanceof Error && error.message.includes('429')
}

// Check if an error is a forbidden (403) response. Retrying won't help.
// Move straight to DLQ.
function isForbidden(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 403
  }
  return error instanceof Error && error.message.includes('403')
}

// Extract Retry-After seconds from a structured EmailAPIError, or default to 60s.
function getRetryAfterSeconds(error: unknown): number {
  if (error && typeof error === 'object' && 'retryAfterSeconds' in error) {
    return (error as { retryAfterSeconds: number | null }).retryAfterSeconds ?? 60
  }
  return 60
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }

  try {
    const payload = parts[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')

    return JSON.parse(atob(payload)) as Record<string, unknown>
  } catch {
    return null
  }
}

// Move a message to the dead letter queue and log the reason.
async function moveToDlq(
  supabase: ReturnType<typeof createClient>,
  queue: string,
  msg: { msg_id: number; message: Record<string, unknown> },
  reason: string,
  dlqEvents?: DlqEvent[],
  attempts?: number
): Promise<void> {
  const payload = msg.message
  await supabase.from('email_send_log').insert({
    message_id: payload.message_id,
    template_name: (payload.label || queue) as string,
    recipient_email: payload.to,
    status: 'dlq',
    error_message: reason,
  })
  const { error } = await supabase.rpc('move_to_dlq', {
    source_queue: queue,
    dlq_name: `${queue}_dlq`,
    message_id: msg.msg_id,
    payload,
  })
  if (error) {
    console.error('Failed to move message to DLQ', { queue, msg_id: msg.msg_id, reason, error })
  }
  if (dlqEvents) {
    dlqEvents.push({
      queue,
      template: String(payload.label || queue),
      recipient: String(payload.to || 'unknown'),
      reason: reason.slice(0, 500),
      message_id: typeof payload.message_id === 'string' ? payload.message_id : null,
      idempotency_key:
        typeof payload.idempotency_key === 'string' ? payload.idempotency_key : null,
      attempts: typeof attempts === 'number' ? attempts : undefined,
      payload,
    })
  }
}

// Fire one summary notification per run when any messages dead-lettered.
// Writes an admin-targeted notification row AND enqueues a single alert
// email through the same platform queue we're operating (idempotency key
// scoped to the invocation prevents accidental double-fires).
async function notifyDlqBatch(
  supabase: ReturnType<typeof createClient>,
  events: DlqEvent[]
): Promise<void> {
  if (events.length === 0) return

  // Aggregate for the summary. Reasons are normalized to first-class buckets
  // so the alert email and the admin DlqAlertCard show the same categories.
  // Keep this list in sync with DlqAlertCard.summarizeReason().
  const normalizeReason = (raw: string): string => {
    const r = raw.toLowerCase()
    if (r.includes('max retries')) return 'Max retries exceeded'
    if (r.includes('ttl exceeded')) return 'TTL exceeded'
    if (r.includes('missing_unsubscribe')) return 'missing_unsubscribe (400)'
    if (r.includes('suppressed') || r.includes('unsubscribed') || r.includes('suppression'))
      return 'Recipient suppressed / unsubscribed'
    if (r.includes('invalid_recipient') || r.includes('invalid email') || r.includes('bounce'))
      return 'Invalid recipient / bounce'
    if (r.includes('rate_limited') || r.includes('429')) return 'Rate limited (429)'
    if (r.includes('403')) return 'Forbidden (403)'
    return raw.split('\n')[0].slice(0, 160)
  }
  const byTemplate = new Map<string, number>()
  const byReason = new Map<string, number>()
  for (const e of events) {
    byTemplate.set(e.template, (byTemplate.get(e.template) ?? 0) + 1)
    const bucket = normalizeReason(e.reason)
    byReason.set(bucket, (byReason.get(bucket) ?? 0) + 1)
  }
  const templateBreakdown = Array.from(byTemplate.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([template, count]) => ({ template, count }))
  const reasonBreakdown = Array.from(byReason.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }))

  // Human-readable template names for the admin notification. Keep in sync
  // with the registry so ops see "Order confirmation email" instead of the
  // raw template slug.
  const TEMPLATE_LABELS: Record<string, string> = {
    'customer-confirmation-request': 'Order confirmation email',
    'portal-invite': 'Customer portal invite',
    'kyc-onboarding': 'KYC onboarding email',
    'kyc-reminder': 'KYC reminder email',
    'password-reset': 'Password reset email',
    'birthday-song': 'Birthday song email',
  }
  const friendlyTemplate = (slug: string): string =>
    TEMPLATE_LABELS[slug] || slug.replace(/[-_]/g, ' ')

  // Try to enrich each event with the order it was triggered from. All our
  // per-order senders embed the order UUID in the idempotency key
  // (e.g. "send-customer-confirmation-request:email:<orderId>:<attempt>"),
  // so we pull the first UUID we find and look up the order in one query.
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  const orderIds = Array.from(
    new Set(
      events
        .map((e) => (e.idempotency_key || '').match(UUID_RE)?.[0] || null)
        .filter((v): v is string => !!v),
    ),
  )
  type OrderRow = {
    id: string
    order_number: string | null
    customer_name: string | null
    sales_person_id: string | null
    sales_person_name?: string | null
  }
  const orderById = new Map<string, OrderRow>()
  if (orderIds.length > 0) {
    try {
      const { data: orderRows } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, sales_person_id')
        .in('id', orderIds)
      const rows = (orderRows || []) as OrderRow[]
      const spIds = Array.from(
        new Set(rows.map((r) => r.sales_person_id).filter((v): v is string => !!v)),
      )
      const spNameById = new Map<string, string>()
      if (spIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', spIds)
        for (const p of (profs || []) as { id: string; full_name: string | null }[]) {
          if (p.full_name) spNameById.set(p.id, p.full_name)
        }
      }
      for (const r of rows) {
        r.sales_person_name = r.sales_person_id
          ? spNameById.get(r.sales_person_id) || null
          : null
        orderById.set(r.id, r)
      }
    } catch (err) {
      console.error('DLQ enrichment: order lookup failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const eventOrderId = (e: DlqEvent): string | null =>
    (e.idempotency_key || '').match(UUID_RE)?.[0] || null

  // Build a friendly, per-event line: order number, customer, salesperson,
  // template, and short reason. Falls back gracefully when the order can
  // no longer be resolved (rare — e.g. hard-deleted order).
  const describeEvent = (e: DlqEvent): string => {
    const tpl = friendlyTemplate(e.template)
    const orderId = eventOrderId(e)
    const ord = orderId ? orderById.get(orderId) : null
    const parts: string[] = []
    if (ord?.order_number) parts.push(`Order #${ord.order_number}`)
    if (ord?.customer_name) parts.push(`customer ${ord.customer_name}`)
    if (ord?.sales_person_name) parts.push(`salesperson ${ord.sales_person_name}`)
    const who = parts.length > 0 ? ` — ${parts.join(', ')}` : ''
    const reasonShort = e.reason.split('\n')[0].slice(0, 140)
    return `${tpl}${who}. Reason: ${reasonShort}. Recipient: ${e.recipient}.`
  }

  // Compose the admin notification message. For a single failure, spell
  // out the order/customer/salesperson inline so ops know exactly which
  // email to resend. For multiple failures, list up to 3 and note the
  // remainder so the row stays scannable.
  const eventLines = events.map(describeEvent)
  const friendlyMessage = eventLines.length === 1
    ? `Delivery failed — ${eventLines[0]} Open the order to resend from the customer email button.`
    : `${events.length} customer emails failed to deliver:\n• ${
        eventLines.slice(0, 3).join('\n• ')
      }${eventLines.length > 3 ? `\n• …and ${eventLines.length - 3} more` : ''}`
  const friendlyTitle = events.length === 1
    ? `Customer email not delivered${
        (() => {
          const ord = eventOrderId(events[0])
            ? orderById.get(eventOrderId(events[0])!)
            : null
          return ord?.order_number ? ` — Order #${ord.order_number}` : ''
        })()
      }`
    : `${events.length} customer emails not delivered`

  // 1. Admin notification row (existing feed).
  const { error: notifError } = await supabase.from('notifications').insert({
    type: 'email_dlq_alert',
    title: friendlyTitle,
    message: friendlyMessage,
    // Best-effort deep link: only single-event failures unambiguously map
    // to one order.
    order_id:
      events.length === 1 && eventOrderId(events[0])
        ? eventOrderId(events[0])
        : null,
    target_role: 'admin',
  })
  if (notifError) {
    console.error('Failed to insert DLQ admin notification', { error: notifError })
  }

  // 2. Single summary email — sent OUT-OF-BAND via Resend, NOT enqueued
  //    into the same platform queue we are monitoring. If the queue is
  //    jammed (which is the exact failure mode this alert exists to
  //    catch), enqueuing the alert would delay its own alarm behind the
  //    backlog. Raw HTML through the seam is intentional — this is an
  //    internal admin alert, not a customer-facing template.
  const runAt = new Date().toISOString()
  const alertTo = Deno.env.get('DLQ_ALERT_TO') || 'support@xboom.in'
  const templateRows = templateBreakdown
    .map(
      (t) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${escapeHtml(t.template)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums">${t.count}</td></tr>`,
    )
    .join('')
  const reasonRows = reasonBreakdown
    .map(
      (r) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${escapeHtml(r.reason)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums">${r.count}</td></tr>`,
    )
    .join('')
  const sampleRows = events
    .slice(0, 10)
    .map(
      (e) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${escapeHtml(e.template)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${escapeHtml(e.recipient)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${escapeHtml(e.reason.slice(0, 200))}</td></tr>`,
    )
    .join('')
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:640px">
      <h2 style="margin:0 0 8px">Email dispatcher DLQ alert</h2>
      <p style="margin:0 0 12px;color:#444">
        <strong>${events.length}</strong> email(s) moved to DLQ in the run at
        ${escapeHtml(runAt)}. This alert was sent OUT-OF-BAND via Resend so a
        jammed platform queue cannot delay its own alarm.
      </p>
      <h3 style="margin:16px 0 4px;font-size:14px">By template</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px">${templateRows}</table>
      <h3 style="margin:16px 0 4px;font-size:14px">By reason</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px">${reasonRows}</table>
      <h3 style="margin:16px 0 4px;font-size:14px">Sample (first 10)</h3>
      <table style="border-collapse:collapse;width:100%;font-size:12px">
        <thead><tr style="text-align:left;background:#fafafa"><th style="padding:4px 8px">Template</th><th style="padding:4px 8px">Recipient</th><th style="padding:4px 8px">Reason</th></tr></thead>
        <tbody>${sampleRows}</tbody>
      </table>
    </div>
  `

  try {
    const result = await sendMailSeam({
      provider: 'resend',
      to: alertTo,
      subject: `Email DLQ: ${events.length} dead-lettered`,
      html,
    })
    if (!result.ok) {
      console.error('DLQ alert email (Resend) failed', {
        status: result.status,
        error: result.error,
      })
    }
  } catch (err) {
    console.error('DLQ alert email dispatch crashed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

Deno.serve(async (req) => {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Defense in depth: verify_jwt=true already requires a valid JWT at the
  // gateway layer. This adds an explicit role check so only service-role
  // callers can trigger queue processing.
  const token = authHeader.slice('Bearer '.length).trim()
  const claims = parseJwtClaims(token)
  if (claims?.role !== 'service_role') {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Collected DLQ events for this run — a single summary alert is fired at
  // the end (see notifyDlqBatch). NEVER notify per-message: a broken
  // template could dead-letter dozens per invocation.
  const dlqEvents: DlqEvent[] = []

  // 1. Check rate-limit cooldown and read queue config
  const { data: state } = await supabase
    .from('email_send_state')
    .select('retry_after_until, batch_size, send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes')
    .single()

  if (state?.retry_after_until && new Date(state.retry_after_until) > new Date()) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'rate_limited' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  const batchSize = state?.batch_size ?? DEFAULT_BATCH_SIZE
  const sendDelayMs = state?.send_delay_ms ?? DEFAULT_SEND_DELAY_MS
  const ttlMinutes: Record<string, number> = {
    auth_emails: state?.auth_email_ttl_minutes ?? DEFAULT_AUTH_TTL_MINUTES,
    transactional_emails: state?.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES,
  }

  let totalProcessed = 0

  // 2. Process auth_emails first (priority), then transactional_emails
  for (const queue of ['auth_emails', 'transactional_emails']) {
    const { data: messages, error: readError } = await supabase.rpc('read_email_batch', {
      queue_name: queue,
      batch_size: batchSize,
      vt: 30,
    })

    if (readError) {
      console.error('Failed to read email batch', { queue, error: readError })
      continue
    }

    if (!messages?.length) continue

    // Retry budget is based on real send failures, not pgmq read_ct.
    // read_ct increments for every message in a claimed batch, including
    // messages not attempted when a 429 stops processing early.
    const messageIds = Array.from(
      new Set(
        messages
          .map((msg) =>
            msg?.message?.message_id && typeof msg.message.message_id === 'string'
              ? msg.message.message_id
              : null
          )
          .filter((id): id is string => Boolean(id))
      )
    )
    const failedAttemptsByMessageId = new Map<string, number>()
    if (messageIds.length > 0) {
      const { data: failedRows, error: failedRowsError } = await supabase
        .from('email_send_log')
        .select('message_id')
        .in('message_id', messageIds)
        .eq('status', 'failed')

      if (failedRowsError) {
        console.error('Failed to load failed-attempt counters', {
          queue,
          error: failedRowsError,
        })
      } else {
        for (const row of failedRows ?? []) {
          const messageId = row?.message_id
          if (typeof messageId !== 'string' || !messageId) continue
          failedAttemptsByMessageId.set(
            messageId,
            (failedAttemptsByMessageId.get(messageId) ?? 0) + 1
          )
        }
      }
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const payload = msg.message
      const failedAttempts =
        payload?.message_id && typeof payload.message_id === 'string'
          ? (failedAttemptsByMessageId.get(payload.message_id) ?? 0)
          : msg.read_ct ?? 0

      // Drop expired messages (TTL exceeded).
      // Prefer payload.queued_at when present; fall back to PGMQ's enqueued_at
      // which is always set by the queue.
      const queuedAt = payload.queued_at ?? msg.enqueued_at
      if (queuedAt) {
        const ageMs = Date.now() - new Date(queuedAt).getTime()
        const maxAgeMs = ttlMinutes[queue] * 60 * 1000
        if (ageMs > maxAgeMs) {
          console.warn('Email expired (TTL exceeded)', {
            queue,
            msg_id: msg.msg_id,
            queued_at: queuedAt,
            ttl_minutes: ttlMinutes[queue],
          })
          await moveToDlq(supabase, queue, msg, `TTL exceeded (${ttlMinutes[queue]} minutes)`, dlqEvents, failedAttempts)
          continue
        }
      }

      // Move to DLQ if max failed send attempts reached.
      if (failedAttempts >= MAX_RETRIES) {
        await moveToDlq(supabase, queue, msg, `Max retries (${MAX_RETRIES}) exceeded (attempted ${failedAttempts} times)`, dlqEvents, failedAttempts)
        continue
      }

      // Guard: skip if another worker already sent this message (VT expired race)
      if (payload.message_id) {
        const { data: alreadySent } = await supabase
          .from('email_send_log')
          .select('id')
          .eq('message_id', payload.message_id)
          .eq('status', 'sent')
          .maybeSingle()

        if (alreadySent) {
          console.warn('Skipping duplicate send (already sent)', {
            queue,
            msg_id: msg.msg_id,
            message_id: payload.message_id,
          })
          const { error: dupDelError } = await supabase.rpc('delete_email', {
            queue_name: queue,
            message_id: msg.msg_id,
          })
          if (dupDelError) {
            console.error('Failed to delete duplicate message from queue', { queue, msg_id: msg.msg_id, error: dupDelError })
          }
          continue
        }
      }

      try {
        await sendLovableEmail(
          buildDispatcherPayload(payload),
          // sendUrl is optional — when LOVABLE_SEND_URL is not set, the library
          // falls back to the default Lovable API endpoint (https://api.lovable.dev).
          // Set LOVABLE_SEND_URL as a Supabase secret to override (e.g. for local dev).
          { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') }
        )

        // Log success
        await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'sent',
        })

        // Delete from queue
        const { error: delError } = await supabase.rpc('delete_email', {
          queue_name: queue,
          message_id: msg.msg_id,
        })
        if (delError) {
          console.error('Failed to delete sent message from queue', { queue, msg_id: msg.msg_id, error: delError })
        }
        totalProcessed++
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('Email send failed', {
          queue,
          msg_id: msg.msg_id,
          read_ct: msg.read_ct,
          failed_attempts: failedAttempts,
          error: errorMsg,
        })

        if (isRateLimited(error)) {
          await supabase.from('email_send_log').insert({
            message_id: payload.message_id,
            template_name: payload.label || queue,
            recipient_email: payload.to,
            status: 'rate_limited',
            error_message: errorMsg.slice(0, 1000),
          })

          const retryAfterSecs = getRetryAfterSeconds(error)
          await supabase
            .from('email_send_state')
            .update({
              retry_after_until: new Date(
                Date.now() + retryAfterSecs * 1000
              ).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', 1)

          // Stop processing — remaining messages stay in queue (VT expires, retried next cycle)
          return new Response(
            JSON.stringify({ processed: totalProcessed, stopped: 'rate_limited' }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        }

        // 403s are permanent configuration or authorization failures for this
        // message, so move straight to DLQ and stop processing the rest of the batch.
        if (isForbidden(error)) {
          await moveToDlq(supabase, queue, msg, errorMsg.slice(0, 1000), dlqEvents, failedAttempts + 1)
          // Fire DLQ notification before returning early.
          await notifyDlqBatch(supabase, dlqEvents)
          return new Response(
            JSON.stringify({ processed: totalProcessed, stopped: 'forbidden' }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        }

        // Log non-429 failures to track real retry attempts.
        await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'failed',
          error_message: errorMsg.slice(0, 1000),
        })
        if (payload?.message_id && typeof payload.message_id === 'string') {
          failedAttemptsByMessageId.set(payload.message_id, failedAttempts + 1)
        }

        // Non-429 errors: message stays invisible until VT expires, then retried
      }

      // Small delay between sends to smooth bursts
      if (i < messages.length - 1) {
        await new Promise((r) => setTimeout(r, sendDelayMs))
      }
    }
  }

  // Fire ONE summary DLQ alert for the whole run.
  await notifyDlqBatch(supabase, dlqEvents)

  return new Response(
    JSON.stringify({ processed: totalProcessed }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
