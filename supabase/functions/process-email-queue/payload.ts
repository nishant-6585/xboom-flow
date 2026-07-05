// Pure payload-builder for the sendLovableEmail seam. Kept in a separate
// module so it can be unit-tested without importing Deno.serve / npm side
// effects from index.ts.
//
// SEAM CONTRACT (see dispatcher_payload_test.ts):
//   - reply_to flows through verbatim (was silently dropped before the
//     2026-07-05 fix; every email replied to the noreply From address).
//   - unsubscribe_token flows through verbatim. The upstream delivery API
//     mandates it on every send — including transactional templates — and
//     returns 400 missing_unsubscribe if omitted. There is currently NO
//     API flag to suppress the rendered footer for transactional mail;
//     `skip_unsubscribe_footer` is carried on the queue payload for the
//     day the platform exposes such a flag.
//   - Only the fields declared in EmailSendRequest are forwarded — no
//     internal queue metadata (queued_at, skip_unsubscribe_footer, ...)
//     leaks to the delivery API.
export interface EnqueuedEmail {
  message_id?: string
  run_id?: string
  to?: string
  from?: string
  sender_domain?: string
  subject?: string
  html?: string
  text?: string
  purpose?: string
  label?: string
  idempotency_key?: string
  reply_to?: string
  unsubscribe_token?: string | null
  skip_unsubscribe_footer?: boolean
  // Anything else on the queue payload (queued_at, ...) is intentionally
  // ignored by the seam builder.
  [key: string]: unknown
}

export interface DispatcherPayload {
  run_id?: string
  to?: string
  from?: string
  sender_domain?: string
  subject?: string
  html?: string
  text?: string
  purpose?: string
  label?: string
  idempotency_key?: string
  reply_to?: string
  unsubscribe_token?: string
  message_id?: string
}

export function buildDispatcherPayload(payload: EnqueuedEmail): DispatcherPayload {
  return {
    run_id: payload.run_id,
    to: payload.to,
    from: payload.from,
    sender_domain: payload.sender_domain,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    purpose: payload.purpose,
    label: payload.label,
    idempotency_key: payload.idempotency_key,
    reply_to: payload.reply_to,
    // Verbatim pass-through. See seam contract note above.
    unsubscribe_token: payload.unsubscribe_token ?? undefined,
    message_id: payload.message_id,
  }
}