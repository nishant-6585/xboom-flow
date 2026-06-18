-- pgTAP RLS tests for invoice_items and invoice_payments.
-- Verifies the admin/finance-only write contract added on 2026-06-18 after
-- the prior `is_user_approved` ALL policies were dropped.
--
-- Run with: supabase test db
-- Per-role JWT is simulated via set_config('request.jwt.claims', ...) +
-- SET LOCAL ROLE authenticated|anon — pgTAP wraps each file in a txn that
-- is rolled back at the end, so seed data is throwaway.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- ---------------------------------------------------------------------------
-- Seed: three test users, one of each relevant role, plus an invoice fixture.
-- All inserts run as a privileged role so RLS doesn't interfere with setup.
-- ---------------------------------------------------------------------------
set local role postgres;

-- Use stable uuids so we can reference them inside set_config() strings.
\set admin_uid     '11111111-1111-1111-1111-111111111111'
\set finance_uid   '22222222-2222-2222-2222-222222222222'
\set sales_uid     '33333333-3333-3333-3333-333333333333'
\set invoice_uid   '44444444-4444-4444-4444-444444444444'

insert into auth.users (id, email, instance_id, aud, role)
values
  (:'admin_uid'::uuid,   'rls-admin@test.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'finance_uid'::uuid, 'rls-finance@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'sales_uid'::uuid,   'rls-sales@test.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  (:'admin_uid'::uuid,   'admin'),
  (:'finance_uid'::uuid, 'finance'),
  (:'sales_uid'::uuid,   'sales')
on conflict (user_id, role) do nothing;

-- is_user_approved() check — give sales user an approved profile so that the
-- read-side policy lets them SELECT.
insert into public.profiles (id, full_name, is_approved)
values (:'sales_uid'::uuid, 'RLS Sales User', true)
on conflict (id) do update set is_approved = true;

insert into public.invoices
  (id, invoice_number, customer_name, created_by, created_by_name)
values
  (:'invoice_uid'::uuid, 'RLS-TEST-0001', 'RLS Customer', :'admin_uid'::uuid, 'RLS Admin')
on conflict (id) do nothing;

-- Helper macro: switch the txn into "user X is calling the Data API".
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

create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end$$;

-- ---------------------------------------------------------------------------
-- invoice_items
-- ---------------------------------------------------------------------------

-- Sales (approved) can SELECT
select pg_temp.as_user(:'sales_uid'::uuid);
select lives_ok(
  $$ select * from public.invoice_items where invoice_id = '44444444-4444-4444-4444-444444444444' $$,
  'sales (approved) can SELECT invoice_items'
);

-- Sales cannot INSERT
select throws_ok(
  $$ insert into public.invoice_items (invoice_id, product_name) values ('44444444-4444-4444-4444-444444444444', 'no') $$,
  '42501',
  null,
  'sales cannot INSERT into invoice_items'
);

-- Finance CAN insert
select pg_temp.as_user(:'finance_uid'::uuid);
select lives_ok(
  $$ insert into public.invoice_items (invoice_id, product_name, quantity, unit_price)
     values ('44444444-4444-4444-4444-444444444444', 'finance-line', 1, 100) $$,
  'finance can INSERT invoice_items'
);
select lives_ok(
  $$ update public.invoice_items set quantity = 2 where product_name = 'finance-line' $$,
  'finance can UPDATE invoice_items'
);
select lives_ok(
  $$ delete from public.invoice_items where product_name = 'finance-line' $$,
  'finance can DELETE invoice_items'
);

-- Admin CAN insert
select pg_temp.as_user(:'admin_uid'::uuid);
select lives_ok(
  $$ insert into public.invoice_items (invoice_id, product_name, quantity, unit_price)
     values ('44444444-4444-4444-4444-444444444444', 'admin-line', 1, 100) $$,
  'admin can INSERT invoice_items'
);

-- Anon cannot SELECT or INSERT
select pg_temp.as_anon();
select is_empty(
  $$ select 1 from public.invoice_items where invoice_id = '44444444-4444-4444-4444-444444444444' $$,
  'anon cannot SELECT invoice_items'
);
select throws_ok(
  $$ insert into public.invoice_items (invoice_id, product_name) values ('44444444-4444-4444-4444-444444444444', 'nope') $$,
  '42501',
  null,
  'anon cannot INSERT invoice_items'
);

-- ---------------------------------------------------------------------------
-- invoice_payments
-- ---------------------------------------------------------------------------

select pg_temp.as_user(:'sales_uid'::uuid);
select lives_ok(
  $$ select * from public.invoice_payments where invoice_id = '44444444-4444-4444-4444-444444444444' $$,
  'sales (approved) can SELECT invoice_payments'
);
select throws_ok(
  $$ insert into public.invoice_payments (invoice_id, amount, recorded_by, recorded_by_name)
     values ('44444444-4444-4444-4444-444444444444', 50, '33333333-3333-3333-3333-333333333333', 'sales') $$,
  '42501',
  null,
  'sales cannot INSERT invoice_payments'
);

select pg_temp.as_user(:'finance_uid'::uuid);
select lives_ok(
  $$ insert into public.invoice_payments (invoice_id, amount, recorded_by, recorded_by_name)
     values ('44444444-4444-4444-4444-444444444444', 100, '22222222-2222-2222-2222-222222222222', 'finance') $$,
  'finance can INSERT invoice_payments'
);

select pg_temp.as_user(:'admin_uid'::uuid);
select lives_ok(
  $$ update public.invoice_payments set notes = 'admin-update' where invoice_id = '44444444-4444-4444-4444-444444444444' $$,
  'admin can UPDATE invoice_payments'
);
select lives_ok(
  $$ delete from public.invoice_payments where invoice_id = '44444444-4444-4444-4444-444444444444' $$,
  'admin can DELETE invoice_payments'
);

select pg_temp.as_anon();
select is_empty(
  $$ select 1 from public.invoice_payments where invoice_id = '44444444-4444-4444-4444-444444444444' $$,
  'anon cannot SELECT invoice_payments'
);
select throws_ok(
  $$ insert into public.invoice_payments (invoice_id, amount, recorded_by, recorded_by_name)
     values ('44444444-4444-4444-4444-444444444444', 1, '00000000-0000-0000-0000-000000000000', 'anon') $$,
  '42501',
  null,
  'anon cannot INSERT invoice_payments'
);

select * from finish();

rollback;