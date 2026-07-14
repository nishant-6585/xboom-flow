-- pgTAP: a salesperson can INSERT a payment record on their own order
-- (pending by default), and can UPDATE it while it is still pending or
-- rejected. Approved rows remain immutable for the sales role.
--
-- Regression coverage for the ORD2600397 incident where uploading a
-- payment proof tripped guard_orders_sensitive_updates /
-- orders_sales_locked_columns_check via the sync_order_amount_paid
-- trigger.
--
-- Run with: supabase test db

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

set local role postgres;

\set sales_uid  '33333333-3333-3333-3333-333333333331'
\set admin_uid  '11111111-1111-1111-1111-111111111112'
\set order_uid  '55555555-5555-5555-5555-555555555551'
\set pay_uid    '88888888-8888-8888-8888-888888888881'

insert into auth.users (id, email, instance_id, aud, role) values
  (:'sales_uid'::uuid, 'pr-sales@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'admin_uid'::uuid, 'pr-admin@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  (:'sales_uid'::uuid, 'sales'),
  (:'admin_uid'::uuid, 'admin')
on conflict (user_id, role) do nothing;

insert into public.profiles (id, full_name, is_approved) values
  (:'sales_uid'::uuid, 'Payment Sales User', true),
  (:'admin_uid'::uuid, 'Payment Admin User', true)
on conflict (id) do update set is_approved = true;

-- Seed order owned by the sales user (bypass RLS as postgres).
insert into public.orders
  (id, order_number, customer_name, sales_person_id, sales_person_name,
   product_name, product_code, quantity, created_by, status, payment_status,
   selling_price, amount_paid, delivery_mode)
values
  (:'order_uid'::uuid, 'PR-TEST-0001', 'Payment Test Customer',
   :'sales_uid'::uuid, 'Payment Sales User',
   'Test Drone', 'PR-SKU-01', 1, :'admin_uid'::uuid,
   'po_received', 'unpaid', 100000, 0, 'courier');

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

-- ---------------------------------------------------------------------------
-- 1. Sales INSERT of a pending payment record on their own order succeeds.
--    This exercises the sync_order_amount_paid trigger path that must NOT
--    trip guard_orders_sensitive_updates / orders_sales_locked_columns_check.
-- ---------------------------------------------------------------------------
select pg_temp.as_user(:'sales_uid'::uuid);

select lives_ok(
  $$ insert into public.payment_records
       (id, order_id, amount, screenshot_url, notes, submitted_by)
     values
       ('88888888-8888-8888-8888-888888888881',
        '55555555-5555-5555-5555-555555555551',
        25000, null, 'sales upload', '33333333-3333-3333-3333-333333333331') $$,
  'sales can INSERT a pending payment record on their own order (internal amount_paid sync allowed)'
);

select is(
  (select status from public.payment_records where id = :'pay_uid'::uuid),
  'pending',
  'newly-inserted sales payment record defaults to status=pending'
);

-- Verify the internal sync ran and updated the order's amount_paid without
-- being blocked by the sensitive-update guards.
select ok(
  (select amount_paid from public.orders where id = :'order_uid'::uuid) >= 25000,
  'sync_order_amount_paid updated orders.amount_paid despite sales caller'
);

-- ---------------------------------------------------------------------------
-- 2. Sales can UPDATE their pending payment record (edit amount/notes).
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ update public.payment_records
       set amount = 30000, notes = 'edited by sales'
     where id = '88888888-8888-8888-8888-888888888881' $$,
  'sales can UPDATE their own pending payment record'
);

-- ---------------------------------------------------------------------------
-- 3. When a record is rejected, sales can still edit it (must round-trip
--    back to pending per the WITH CHECK clause).
-- ---------------------------------------------------------------------------
set local role postgres;
update public.payment_records set status = 'rejected'
 where id = :'pay_uid'::uuid;
select pg_temp.as_user(:'sales_uid'::uuid);

select lives_ok(
  $$ update public.payment_records
       set notes = 'resubmitting after rejection', status = 'pending'
     where id = '88888888-8888-8888-8888-888888888881' $$,
  'sales can re-submit a rejected payment record on their own order'
);

-- ---------------------------------------------------------------------------
-- 4. Once approved, sales CANNOT modify the record anymore.
-- ---------------------------------------------------------------------------
set local role postgres;
update public.payment_records set status = 'approved'
 where id = :'pay_uid'::uuid;
select pg_temp.as_user(:'sales_uid'::uuid);

-- RLS filters out the row, so the UPDATE affects 0 rows (no error, no change).
with upd as (
  update public.payment_records set notes = 'sales tampering'
   where id = :'pay_uid'::uuid
  returning 1
)
select is((select count(*)::int from upd), 0,
  'sales cannot UPDATE an approved payment record (RLS filters the row out)');

select * from finish();

rollback;