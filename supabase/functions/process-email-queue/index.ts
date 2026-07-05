import { sendLovableEmail } from 'npm:@lovable.dev/email-js'
import { createClient } from 'npm:@supabase/supabase-js@2'

import { buildDispatcherPayload } from './payload.ts'

// A DLQ event captured for post-run notification. We batch these and emit
// ONE summary alert per invocation to avoid alert-flood on template outages
// (which is exactly the failure mode we just fixed for customer email).
interface DlqEvent {
  queue: string
  template: string
  recipient: string
  reason: string
  message_id: string | null
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
  dlqEvents?: DlqEvent[]
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
    })
  }
}

// Fire one summary notification per run when any messages dead-lettered.
// Writes an admin-targeted notification row AND enqueues a single alert
// email through the same platform queue we're operating (idempotency key
// scoped to the invocation prevents accidental double-fires).
async function notifyDlqBatch(
  supabase: ReturnType<typeof createClient>,
  events: DlqEvent[],
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<void> {
  if (events.length === 0) return

  // Aggregate for the summary.
  const byTemplate = new Map<string, number>()
  const byReason = new Map<string, number>()
  for (const e of events) {
    byTemplate.set(e.template, (byTemplate.get(e.template) ?? 0) + 1)
    // Compact reason keys — collapse long API error bodies to the first line.
    const shortReason = e.reason.split('\n')[0].slice(0, 160)
    byReason.set(shortReason, (byReason.get(shortReason) ?? 0) + 1)
  }
  const templateBreakdown = Array.from(byTemplate.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([template, count]) => ({ template, count }))
  const reasonBreakdown = Array.from(byReason.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }))

  const summary = `${events.length} email(s) moved to DLQ. Templates: ${
    templateBreakdown.map((t) => `${t.template} × ${t.count}`).join(', ')
  }.`

  // 1. Admin notification row (existing feed).
  const { error: notifError } = await supabase.from('notifications').insert({
    type: 'email_dlq_alert',
    title: `Email dispatcher: ${events.length} message(s) dead-lettered`,
    message: summary,
    target_role: 'admin',
  })
  if (notifError) {
    console.error('Failed to insert DLQ admin notification', { error: notifError })
  }

  // 2. Single summary email via the same platform queue.
  // Idempotency key uses the current UTC minute + event count so retries
  // within the same batch collapse and normal runs get unique keys.
  const nowMinute = new Date().toISOString().slice(0, 16) // YYYY-MM-DDTHH:MM
  const idempotencyKey = `dlq-alert-${nowMinute}-${events.length}`

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        templateName: 'dlq-alert',
        idempotencyKey,
        templateData: {
          totalCount: events.length,
          templateBreakdown,
          reasonBreakdown,
          sampleEvents: events.slice(0, 10),
          runAt: new Date().toISOString(),
        },
      }),
    })
    // Consume response body to prevent resource leaks in Deno.
    await res.text()
    if (!res.ok) {
      console.error('DLQ alert email dispatch returned non-2xx', { status: res.status })
    }
  } catch (err) {
    console.error('DLQ alert email dispatch failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
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
          await moveToDlq(supabase, queue, msg, `TTL exceeded (${ttlMinutes[queue]} minutes)`, dlqEvents)
          continue
        }
      }

      // Move to DLQ if max failed send attempts reached.
      if (failedAttempts >= MAX_RETRIES) {
        await moveToDlq(supabase, queue, msg, `Max retries (${MAX_RETRIES}) exceeded (attempted ${failedAttempts} times)`, dlqEvents)
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
          await moveToDlq(supabase, queue, msg, errorMsg.slice(0, 1000), dlqEvents)
          // Fire DLQ notification before returning early.
          await notifyDlqBatch(supabase, dlqEvents, supabaseUrl, supabaseServiceKey)
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
  await notifyDlqBatch(supabase, dlqEvents, supabaseUrl, supabaseServiceKey)

  return new Response(
    JSON.stringify({ processed: totalProcessed }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
