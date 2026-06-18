# RLS tests

Run with: `supabase test db`

These are **pgTAP** tests (the format `supabase test db` actually executes —
see https://supabase.com/docs/guides/local-development/testing/pgtap-extended).
Per-role JWTs are simulated by setting `request.jwt.claims` + `SET LOCAL ROLE`
inside a transaction; no live Supabase project, no real auth tokens, no
network — runs entirely against the local DB.

Add one file per table/policy area. Files must end in `.sql` and live under
`supabase/tests/`.

## Files

- `invoice_items_payments.sql` — guards the admin/finance-only write contract
  on `invoice_items` and `invoice_payments` (added 2026-06-18 after the
  `is_user_approved` ALL policy was dropped). Verifies:
  - approved non-finance users can SELECT but cannot INSERT/UPDATE/DELETE
  - finance role can write
  - admin role can write
  - unauthenticated (`anon`) cannot SELECT or write