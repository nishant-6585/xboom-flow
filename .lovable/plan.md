# Zoho Books Invoice Poller — Phase 2

Reuses the existing Zoho OAuth connection (`zoho_tokens`, org `862649719`, `.com` API domain). No new self-client, no new client secrets.

## 1. Database changes (one migration)

- Add columns to `zoho_books_invoices`:
  - `match_status text` — `matched` | `unmatched` | `pending` (default `pending`)
  - `pdf_attached_invoice_id uuid` — FK to `order_invoices(id)` for idempotency
  - `pdf_synced_at timestamptz`
  - `pdf_hash text` — sha256 of last uploaded PDF bytes, so we only re-upload when Zoho changed the PDF
- Add columns to `order_invoices`:
  - `zoho_invoice_id text UNIQUE` — links the attachment back to Zoho (one order_invoices row per Zoho invoice)
- New table `zoho_poller_state` (single row): `last_polled_at timestamptz`, `last_success_at timestamptz`, `last_error text`
- Extend `match_zoho_invoices_to_orders()` RPC to also write `match_status='matched'` when a link is found and keep unmatched rows at `unmatched` after a first pass.

## 2. New edge function `zoho-invoice-poller`

Config: `verify_jwt = false`, cron-authenticated via existing `isAuthorizedCron` (`X-Cron-Secret`).

Flow per invocation:

1. Read `zoho_poller_state.last_polled_at` (fallback: 24h ago on first run).
2. `getValidToken()` (same helper as `zoho-books-sync`).
3. `GET {api_domain}/books/v3/invoices?organization_id=…&last_modified_time=<cursor>&sort_column=last_modified_time&sort_order=A&per_page=200` — paginate via `page_context.has_more_page`.
4. Upsert each into `zoho_books_invoices` (same shape as `zoho-books-sync`).
5. For each new/updated invoice:
   - `GET /books/v3/invoices/{id}?accept=pdf` → fetch bytes, sha256 hash.
   - Skip if `pdf_hash` unchanged (idempotent short-circuit).
   - Determine matching order:
     - (a) `orders.order_number == invoice.reference_number`
     - (b) else `orders.customer_email == invoice.email` AND `abs(orders.total_sales_amount - invoice.total) <= 1`
     - (c) else mark `match_status='unmatched'` — skip PDF attach.
   - If matched: upload PDF to `invoices` bucket at `zoho/{order_id}/{invoice_number}.pdf`, upsert into `order_invoices` keyed on `zoho_invoice_id` (`source='zoho'`, `document_type='tax_invoice'`), update `zoho_books_invoices` with `linked_order_id/number`, `match_method`, `match_status='matched'`, `pdf_attached_invoice_id`, `pdf_hash`, `pdf_synced_at`.
   - Call existing `send-invoice-email` with the new `order_invoices.id` — same idempotency/logging as manual Zoho uploads.
6. Never throw on individual invoice failure — log to `zoho_sync_log`, continue.
7. On overall success, advance `last_polled_at` to `max(last_modified_time)` of processed batch; on failure, leave cursor alone and log to `zoho_sync_log`.

Manual invocation path: allow admin/finance JWT (same role check as `zoho-books-sync`) with a `?since=<iso>` override for backfills.

## 3. Cron

Insert one `pg_cron` job hitting `zoho-invoice-poller` every 15 min via `net.http_post` with the vault `CRON_SECRET` (same pattern as other scheduled functions). Installed via `supabase--insert` (not migration) so it can pull the vault secret at install time.

## 4. Admin UI

New card `UnmatchedZohoInvoicesPanel.tsx` in the Zoho Books settings area:
- Lists `zoho_books_invoices WHERE match_status='unmatched'`
- Each row: invoice #, date, customer, total, "Attach to order…" combobox (searches orders by number/customer), on select → calls a small new RPC `attach_zoho_invoice_to_order(zoho_invoice_id, order_id)` that fetches the PDF (via a new lightweight edge fn `zoho-invoice-attach`), uploads, inserts `order_invoices`, updates link + `match_status='matched'`, and fires `send-invoice-email`.
- RLS: admin/finance only.

Existing `ZohoInvoiceCard` on order detail already renders these — no changes there because it reads `linked_order_number`.

## 5. Verification

After deploy, manually POST to `zoho-invoice-poller` with the cron secret, then report: invoices scanned, new/updated, matched, unmatched, PDFs attached, emails queued.

## Files touched

- `supabase/migrations/…_zoho_poller.sql` — schema changes above + RPC update
- `supabase/functions/zoho-invoice-poller/index.ts` — new
- `supabase/functions/zoho-invoice-attach/index.ts` — new (manual-attach path for the admin UI)
- `supabase/config.toml` — add `verify_jwt = false` blocks for the two new functions
- `src/components/admin/UnmatchedZohoInvoicesPanel.tsx` — new
- `src/components/admin/ZohoBooksSettingsPanel.tsx` — mount the new panel

## Non-goals

- `zoho-invoice-webhook` is left untouched (dormant).
- No changes to the existing `zoho-books-sync` "sync now" button — the two coexist; the poller is the always-on incremental path.

Say **go** and I'll build it in one pass.
