## Goal

1. When a salesperson adds/updates `customer_phone` on an order that previously had no phone, automatically send the customer the **"order created"** SMS followed by the **current status** SMS (e.g. `shipped`, `payment_received`).
2. Show salespeople a clear in-app **prompt for orders missing a mobile number**, and additionally send a **WhatsApp reminder** via Interakt to that salesperson.

## Part A — Catch-up SMS on phone added/updated (DB only)

New `AFTER UPDATE OF customer_phone ON public.orders` trigger:

- Fires only when `OLD.customer_phone` is `NULL`/empty **and** `NEW.customer_phone` has 10–15 digits.
- Enqueues `created` SMS via existing `enqueue_order_notification_v2(...)`.
- If `NEW.status` maps to a customer-facing event (`payment_received`, `shipped`, `delivered`, `cancelled`), enqueues that one too.
- Re-uses the same payload shape as `trg_orders_sms_notify` so the worker + MSG91 templates pick it up unchanged.
- Idempotency guard: insert a `domain_events` row `order.phone_catchup_sent` keyed on order_id and skip if already present (prevents duplicate sends if phone is cleared and re-added).

Also extend the existing `trg_orders_sms_notify` slightly: today the `INSERT` branch already skips when phone is empty, which is correct — the new trigger fills the gap.

## Part B — In-app prompt for salespeople

New view `public.orders_missing_phone` (security-invoker) exposing:
`id, order_number, customer_name, customer_company, status, order_date, sales_person_id, sales_person_name, created_at`
filtered to `customer_phone IS NULL OR regexp_replace(customer_phone,'\D','','g') < 10 chars` and `status NOT IN ('cancelled','delivery_done')`.

Frontend:
- New hook `useOrdersMissingPhone()` querying that view scoped to the logged-in user (admins see all).
- New `MissingPhoneBanner` component shown at the top of:
  - `src/pages/Orders.tsx`
  - `src/pages/Dashboard.tsx` (sales role only)
- Banner shows count + collapsible list of order numbers; each row has "Add phone" button that opens the existing order edit dialog focused on the phone field.

## Part C — WhatsApp reminder to salesperson (Interakt)

New edge function `notify-salesperson-missing-phone`:
- Runs on a daily cron (09:30 IST) using existing `CRON_SECRET` pattern.
- Reads `orders_missing_phone` grouped by `sales_person_id`.
- Looks up the salesperson's WhatsApp number from `profiles.phone` (fallback to `employees.phone`).
- Sends one WhatsApp message per salesperson via Interakt template (e.g. `salesperson_missing_phone_reminder`) with body values: `[salesperson_name, order_count, oldest_order_number]`.
- Writes a `domain_events` row per send for traceability.
- Skips orders already nudged in the last 24h to avoid spam.

A second invocation path: immediately after a *new* order is created without a phone (detected by a separate `AFTER INSERT` trigger calling `net.http_post` to this same function with `mode=immediate`), the salesperson gets a one-time WhatsApp ping within ~1 min.

## Part D — Required WhatsApp template at Interakt

You'll need to create and get Interakt to approve a template named (suggested) **`salesperson_missing_phone_reminder`**, language `en`, body:

> Hi {{1}}, you have {{2}} order(s) missing a customer mobile number (oldest: {{3}}). Please update it in XBOOM Flow so customers can receive SMS updates.

Once approved, share the exact template name and I'll wire it into the edge function. Until then the function will log+skip the WhatsApp send and only the in-app banner will be active.

## Technical details

- New migration: catch-up trigger + missing-phone view (+ RLS via `security_invoker=true`).
- Insert tool (not migration) for the pg_cron schedule using the project URL and anon key.
- Edge function: `verify_jwt = false` with manual `X-Cron-Secret` check (matches existing pattern).
- No change to MSG91 templates — the existing `created` / `payment_received` / `shipped` / `delivered` / `cancelled` rows already cover everything.
- No change to `OrderForm` validation; phone remains mandatory client-side, this just rescues orders that slipped through (like ORD2600277).

## Out of scope

- Backfilling SMS for historical orders that already have a phone (the trigger only fires going forward).
- Adding a DB-level NOT NULL constraint on `customer_phone` (still recommended separately; happy to ship that in a follow-up).
