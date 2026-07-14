-- pgTAP tests for the sensitive-update guard triggers rebuilt on 2026-07-07
-- after ticket TKT2600153 (P1): the previous version referenced columns
-- that don't exist on public.orders (`refund_amount`, `refund_date`,
-- `total`, `subtotal`, `gst_amount`), which crashed every sales-rep order
-- edit with `record "new" has no field "refund_amount"`.
--
-- These tests assert TWO things per guarded table:
--   1. A benign UPDATE by a non-privileged role SUCCEEDS.
--      (The prior bug would have failed here — that's the case that was
--      missing from the initial guard test suite.)
--   2. Editing a gated field by a non-privileged role RAISES 42501.
--
-- Run with: supabase test db

begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

set local role postgres;

\set admin_uid          '11111111-1111-1111-1111-111111111111'
\set finance_uid        '22222222-2222-2222-2222-222222222222'
\set sales_uid          '33333333-3333-3333-3333-333333333333'
\set order_uid          '55555555-5555-5555-5555-555555555555'
\set expense_uid        '66666666-6666-6666-6666-666666666666'
\set invoice_uid        '77777777-7777-7777-7777-777777777777'

insert into auth.users (id, email, instance_id, aud, role) values
  (:'admin_uid'::uuid,   'guard-admin@test.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'finance_uid'::uuid, 'guard-finance@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'sales_uid'::uuid,   'guard-sales@test.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  (:'admin_uid'::uuid,   'admin'),
  (:'finance_uid'::uuid, 'finance'),
  (:'sales_uid'::uuid,   'sales')
on conflict (user_id, role) do nothing;

insert into public.profiles (id, full_name, is_approved) values
  (:'sales_uid'::uuid, 'Guard Sales User', true)
on conflict (id) do update set is_approved = true;

-- ---------------------------------------------------------------------------
-- Seed fixtures as postgres (bypass RLS for setup).
-- ---------------------------------------------------------------------------
insert into public.orders
  (id, order_number, customer_name, sales_person_id, sales_person_name,
   product_name, product_code, quantity, created_by, status, payment_status,
   selling_price, amount_paid, delivery_mode)
values
  (:'order_uid'::uuid, 'GUARD-TEST-0001', 'Guard Test Customer',
   :'sales_uid'::uuid, 'Guard Sales User',
   'Test Drone', 'TEST-SKU-01', 1, :'admin_uid'::uuid,
   'po_received', 'unpaid', 100000, 0, 'courier');

insert into public.expenses
  (id, expense_type, amount, created_by, created_by_name, status, description)
values
  (:'expense_uid'::uuid, 'travel', 500, :'sales_uid'::uuid::text, 'Guard Sales User',
   'pending', 'seed');

insert into public.invoices
  (id, invoice_number, customer_name, created_by, created_by_name, status, amount_paid, balance_due)
values
  (:'invoice_uid'::uuid, 'GUARD-INV-0001', 'Guard Invoice Customer',
   :'admin_uid'::uuid, 'Guard Admin', 'draft', 0, 100000);

create or replace function pg_temp.as_user(_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
end$$;

-- ===========================================================================
-- orders guard
-- ===========================================================================
select pg_temp.as_user(:'sales_uid'::uuid);

-- (1) Benign UPDATE by sales SUCCEEDS. This is the case that was missing
-- from the original guard test suite — the column-reference bug would
-- have surfaced here with `record "new" has no field "refund_amount"`.
select lives_ok(
  $$ update public.orders
       set delivery_mode = 'self_pickup'
     where id = '55555555-5555-5555-5555-555555555555' $$,
  'sales can UPDATE a benign order field (delivery_mode)'
);
select lives_ok(
  $$ update public.orders set notes = 'sales edit'
     where id = '55555555-5555-5555-5555-555555555555' $$,
  'sales can UPDATE order notes'
);

-- (2) Sensitive UPDATE by sales is BLOCKED.
select throws_ok(
  $$ update public.orders set payment_status = 'paid'
     where id = '55555555-5555-5555-5555-555555555555' $$,
  '42501',
  null,
  'sales cannot change orders.payment_status'
);
select throws_ok(
  $$ update public.orders set selling_price = 999999
     where id = '55555555-5555-5555-5555-555555555555' $$,
  '42501',
  null,
  'sales cannot change orders.selling_price'
);

-- Finance CAN change payment_status.
select pg_temp.as_user(:'finance_uid'::uuid);
select lives_ok(
  $$ update public.orders set payment_status = 'partial', amount_paid = 50000
     where id = '55555555-5555-5555-5555-555555555555' $$,
  'finance can change orders.payment_status + amount_paid'
);

-- Sales submitting a payment record for their own order triggers an internal
-- order payment sync. That derived sync must be allowed even though direct
-- sales edits to orders.payment_status / amount_paid stay blocked above.
select pg_temp.as_user(:'sales_uid'::uuid);
select lives_ok(
  $$ insert into public.payment_records
       (order_id, amount, screenshot_url, notes, submitted_by)
     values
       ('55555555-5555-5555-5555-555555555555', 25000, null,
        'sales submitted payment proof', '33333333-3333-3333-3333-333333333333') $$,
  'sales can submit a payment record and the internal order payment sync is allowed'
);

-- ===========================================================================
-- expenses guard
-- ===========================================================================
select pg_temp.as_user(:'sales_uid'::uuid);

-- Benign UPDATE by non-privileged role SUCCEEDS.
select lives_ok(
  $$ update public.expenses set description = 'sales edited desc'
     where id = '66666666-6666-6666-6666-666666666666' $$,
  'sales can UPDATE a benign expense field (description)'
);

-- Sensitive UPDATE by sales is BLOCKED.
select throws_ok(
  $$ update public.expenses set status = 'approved'
     where id = '66666666-6666-6666-6666-666666666666' $$,
  '42501',
  null,
  'sales cannot self-approve expenses'
);

-- ===========================================================================
-- invoices guard
-- ===========================================================================
select pg_temp.as_user(:'sales_uid'::uuid);

-- Benign UPDATE by non-privileged role SUCCEEDS.
select lives_ok(
  $$ update public.invoices set customer_name = 'edited by sales'
     where id = '77777777-7777-7777-7777-777777777777' $$,
  'sales can UPDATE a benign invoice field (customer_name)'
);

-- Sensitive UPDATE by sales is BLOCKED.
select throws_ok(
  $$ update public.invoices set status = 'sent'
     where id = '77777777-7777-7777-7777-777777777777' $$,
  '42501',
  null,
  'sales cannot change invoice status'
);

select * from finish();

rollback;