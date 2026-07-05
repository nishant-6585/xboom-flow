// Seam-contract test for buildDispatcherPayload.
//
// Locks in the two invariants the 2026-07-05 reply-to bug violated:
//   1. reply_to on the enqueue payload flows through to the dispatcher call
//      (before the fix it was dropped and every email replied to noreply).
//   2. unsubscribe_token flows through verbatim — including for
//      transactional templates, because the upstream API mandates it and
//      returns 400 missing_unsubscribe if omitted. If the platform ever
//      exposes a "skip footer" flag, update THIS test in lockstep with the
//      builder — the seam contract is the source of truth.
//
// Also asserts that queue-internal metadata (queued_at,
// skip_unsubscribe_footer, ...) does NOT leak into the delivery payload.

import {
  assertEquals,
  assertStrictEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildDispatcherPayload } from './payload.ts'

const baseEnqueue = {
  message_id: 'msg-abc',
  to: 'nishant.k@xboom.in',
  from: 'Xboom <notifications@xboomflow.com>',
  sender_domain: 'notify.xboomflow.com',
  subject: 'KYC required',
  html: '<p>hi</p>',
  text: 'hi',
  purpose: 'transactional',
  label: 'kyc-onboarding',
  idempotency_key: 'kyc-invite-order-370',
  reply_to: 'support@xboom.in',
  unsubscribe_token: 'tok_deadbeef',
  // Fields that must NOT leak to the dispatcher call:
  queued_at: '2026-07-05T10:19:55Z',
  skip_unsubscribe_footer: true,
  extra_internal_flag: 'ignored',
}

Deno.test('dispatcher payload carries reply_to (regression: 2026-07-05 reply-to bug)', () => {
  const out = buildDispatcherPayload(baseEnqueue)
  assertStrictEquals(out.reply_to, 'support@xboom.in')
})

Deno.test('dispatcher payload carries unsubscribe_token verbatim for transactional sends', () => {
  // Transactional intent flagged on the enqueue side …
  const enqueue = { ...baseEnqueue, skip_unsubscribe_footer: true }
  const out = buildDispatcherPayload(enqueue)
  // … but the token still ships, because the upstream API mandates it.
  // If this flips to undefined for transactional sends the API will 400.
  assertStrictEquals(out.unsubscribe_token, 'tok_deadbeef')
})

Deno.test('dispatcher payload carries unsubscribe_token for non-transactional sends too', () => {
  const enqueue = { ...baseEnqueue, skip_unsubscribe_footer: false }
  const out = buildDispatcherPayload(enqueue)
  assertStrictEquals(out.unsubscribe_token, 'tok_deadbeef')
})

Deno.test('missing reply_to on enqueue payload → undefined on dispatcher payload', () => {
  const enqueue = { ...baseEnqueue, reply_to: undefined }
  const out = buildDispatcherPayload(enqueue)
  assertStrictEquals(out.reply_to, undefined)
})

Deno.test('null unsubscribe_token normalizes to undefined (dispatcher never sees null)', () => {
  const enqueue = { ...baseEnqueue, unsubscribe_token: null }
  const out = buildDispatcherPayload(enqueue)
  assertStrictEquals(out.unsubscribe_token, undefined)
})

Deno.test('queue-internal metadata does not leak into dispatcher payload', () => {
  const out = buildDispatcherPayload(baseEnqueue) as Record<string, unknown>
  // Whitelisted fields only.
  const allowedKeys = new Set([
    'run_id', 'to', 'from', 'sender_domain', 'subject', 'html', 'text',
    'purpose', 'label', 'idempotency_key', 'reply_to', 'unsubscribe_token',
    'message_id',
  ])
  const leaked = Object.keys(out).filter((k) => !allowedKeys.has(k))
  assertEquals(leaked, [])
  // Spot-check specific fields we know were on the enqueue side.
  assertStrictEquals(out.queued_at, undefined)
  assertStrictEquals(out.skip_unsubscribe_footer, undefined)
  assertStrictEquals(out.extra_internal_flag, undefined)
})

Deno.test('registered transactional template flags carry through — kyc-onboarding is transactional', async () => {
  // Import the registry to guard the second half of the seam: the sender
  // side must actually classify KYC templates as transactional, which is
  // what tells send-transactional-email to enqueue skip_unsubscribe_footer.
  const { TEMPLATES } = await import(
    '../_shared/transactional-email-templates/registry.ts'
  )
  assertStrictEquals(TEMPLATES['kyc-onboarding']?.transactional, true)
  assertStrictEquals(TEMPLATES['kyc-reminder']?.transactional, true)
  assertStrictEquals(TEMPLATES['kyc-status']?.transactional, true)
})