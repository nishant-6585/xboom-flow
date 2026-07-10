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
- `employees_self_update.sql` — guards the sensitive-column write contract on
  `employees` (added 2026-07-05 after PRIVILEGE_ESCALATION finding). Verifies:
  - a sales employee CAN update their own `bank_account` and `ifsc_code`
  - the same employee CANNOT update `monthly_salary` or `role`
  - HR CAN update `monthly_salary` and `role`
  - each bank/IFSC change writes an `employee_bank_audit_log` row
- `enquiries_sales_followup_update.sql` — sales-role narrow update guard on
  `enquiries` (added 2026-07-10). Verifies:
  - sales user CAN update their own `followup_note` fields
  - sales user CANNOT change `status` or `response_pricing`
  - sales user CANNOT update another salesperson's enquiry note