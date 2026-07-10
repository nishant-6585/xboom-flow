# Auto Follow-up for Sales Prospects

## Goal
Automatically send smart, personalized follow-up emails to prospects with `status = 'active'`, using Lovable AI (Gemini) to draft context-aware copy from the product enquired, prior notes, urgency, timeline, quote, and past touchpoints. Every send is CC'd to `amit@xboom.in`.

## Scope & Rules
- **Eligible**: `prospects.status = 'active'` AND `email IS NOT NULL`.
- **Excluded**: won/lost/dropped, missing email, unsubscribed (`suppressed_emails`), or a reply/inbound touchpoint received after the last outbound.
- **Stop conditions** (any one halts the sequence):
  - status changes to non-active
  - prospect replies (inbound touchpoint / thread reply)
  - 4 attempts sent
  - manually paused

## Smart Cadence (AI-decided, bounded)
Base schedule adjusted by signals:

| Signal | Effect |
|---|---|
| `urgency = high` or `requested_timeline` within 7d | tighter: D+1, D+3, D+6, D+10 |
| `is_a_category = true` or `lead_quality = hot` | tighter + richer context |
| Default | D+2, D+5, D+10, D+18 |
| `quoted_price` present + no reply | attempt 2 references the quote & offers a call |
| Last touchpoint > 21d and no reply | final "closing loop" attempt, then stop |

Send window: 10:00–18:00 IST, weekdays only.

## AI Draft Inputs (per prospect, per attempt)
Passed to Gemini 2.5 Flash via Lovable AI gateway:
- Prospect: name, company, city, customer_type, prospect_type
- Product: product_name, product_category, product_code, quantity, purpose_of_purchase
- Commercial: default_price, quoted_price, discount
- Intent: urgency, requested_timeline, lead_source, lead_quality
- History: `notes`, last N `contact_touchpoints` / `crm_contact_activities` for this phone/email, prior follow-up subjects & summaries
- Attempt number & days since last touch

AI returns strict JSON: `{ subject, body_html, body_text, tone_used, key_hooks[] }`. Guardrails: no fabricated prices/dates, no discounts beyond what's on record, respectful and concise, single clear CTA (reply / book call).

## Architecture

```text
pg_cron (every 15 min IST business hours)
        │
        ▼
edge fn: prospects-auto-followup-scheduler
  • picks eligible prospects due for next attempt
  • enqueues one job per prospect into prospect_followup_queue
        │
        ▼
edge fn: prospects-auto-followup-worker (batch, throttled)
  • loads context (prospect + touchpoints + prior followups)
  • calls Lovable AI (gemini-2.5-flash) for draft
  • invokes existing send-transactional-email
       template: prospect-followup, CC: amit@xboom.in
  • writes prospect_followups row (attempt, subject, body, ai_meta, message_id)
  • logs contact_touchpoints entry (channel=email, direction=outbound)
```

## Data Model (new)

`public.prospect_followup_settings` (single row, admin-tunable)
- `enabled boolean default true`
- `max_attempts int default 4`
- `cc_email text default 'amit@xboom.in'`
- `send_window_start time`, `send_window_end time`, `weekdays_only boolean`

`public.prospect_followups`
- `id, prospect_id, attempt_no, scheduled_for, sent_at`
- `subject, body_html, body_text`
- `ai_model, ai_prompt_hash, ai_meta jsonb`
- `email_message_id, status (queued|sent|skipped|failed), skip_reason`
- unique(`prospect_id`, `attempt_no`)

`public.prospect_followup_events` (audit) — opens/clicks/replies/stops.

RLS: admin + sales_manager read/write; sales read for their own prospects. GRANTs to authenticated + service_role. Service role writes from edge function.

## Email Template
Scaffold `prospect-followup` React-Email template (brand styled, plain but warm):
- Personalized greeting, one-line context ("regarding your enquiry for {product_name}"),
- AI paragraph, quote reference if present,
- Single CTA button ("Reply to this email" / "Book a 15-min call"),
- Signature = assigned salesperson name (fallback: XBoom Sales),
- CC `amit@xboom.in` always, Reply-To = salesperson email.
- Unsubscribe footer auto-appended by infra.

## Admin UI (Sales module)
New tab **Auto Follow-ups** under Prospects:
- Toggle master enable, edit cadence defaults, edit CC list.
- Per-prospect: view scheduled next attempt, past sent emails (preview), Pause / Resume / Send now / Skip next.
- Table: prospect, product, attempt X/4, next send, last status, AI summary.

## Safety & Compliance
- Suppression check via `suppressed_emails` before every send.
- Idempotency key: `prospect-followup-{prospect_id}-{attempt_no}`.
- Rate limit: ≤ 120 emails/min (existing queue default).
- Kill switch: `prospect_followup_settings.enabled = false` halts scheduler immediately.
- Full audit trail in `prospect_followups` + `contact_touchpoints` + `domain_events`.

## Rollout
1. Migration: tables, RLS, GRANTs, settings seed row.
2. Scaffold `prospect-followup` transactional template + deploy.
3. Deploy `prospects-auto-followup-scheduler` and `-worker` edge functions.
4. Schedule pg_cron every 15 min (business hours only via SQL guard).
5. Admin UI tab + controls.
6. **Shadow mode first**: `enabled=false` for 24h; scheduler writes `status='queued'` rows without sending so you can review AI drafts. Flip to `enabled=true` after review.

## Out of scope (this iteration)
WhatsApp/SMS channel, per-salesperson approval queue, A/B copy testing — can layer on later without schema changes.
