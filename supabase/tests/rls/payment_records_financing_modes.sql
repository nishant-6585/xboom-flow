-- pgTAP: financing payment modes (bajaj_finserv, snapmint) are accepted by the
-- payment_records CHECK constraint, and multiple mixed-mode records on the same
-- order aggregate correctly into orders.amount_paid via sync_order_amount_paid.
--
-- Run with: supabase test db

begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

set local role postgres;

\set admin_uid  '11111111-1111-1111-1111-11111111f001'
\set sales_uid  '33333333-3333-3333-3333-33333333f001'
\set order_uid  '55555555-5555-5555-5555-55555555f001'

insert into auth.users (id, email, instance_id, aud, role) values
  (:'sales_uid'::uuid, 'fin-sales@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'admin_uid'::uuid, 'fin-admin@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  (:'sales_uid'::uuid, 'sales'),
  (:'admin_uid'::uuid, 'admin')
on conflict (user_id, role) do nothing;

insert into public.profiles (id, full_name, is_approved) values
  (:'sales_uid'::uuid, 'Fin Sales User', true),
  (:'admin_uid'::uuid, 'Fin Admin User', true)
on conflict (id) do update set is_approved = true;

insert into public.orders
  (id, order_number, customer_name, sales_person_id, sales_person_name,
   product_name, product_code, quantity, created_by, status, payment_status,
   selling_price, amount_paid, delivery_mode)
values
  (:'order_uid'::uuid, 'PR-FIN-0001', 'Financing Test Customer',
   :'sales_uid'::uuid, 'Fin Sales User',
   'Test Drone', 'PR-SKU-FIN', 1, :'admin_uid'::uuid,
   'po_received', 'unpaid', 100000, 0, 'courier');

-- 1. bajaj_finserv is accepted by the CHECK constraint.
select lives_ok(
  $$ insert into public.payment_records
       (order_id, amount, payment_mode, status, notes, submitted_by)
     values
       ('55555555-5555-5555-5555-55555555f001', 40000, 'bajaj_finserv', 'approved',
        'Bajaj EMI disbursed', '11111111-1111-1111-1111-11111111f001') $$,
  'bajaj_finserv is an accepted payment_mode value'
);

-- 2. snapmint is accepted.
select lives_ok(
  $$ insert into public.payment_records
       (order_id, amount, payment_mode, status, notes, submitted_by)
     values
       ('55555555-5555-5555-5555-55555555f001', 25000, 'snapmint', 'approved',
        'Snapmint EMI disbursed', '11111111-1111-1111-1111-11111111f001') $$,
  'snapmint is an accepted payment_mode value'
);

-- 3. Add a UPI record to prove multi-mode aggregation.
select lives_ok(
  $$ insert into public.payment_records
       (order_id, amount, payment_mode, status, notes, submitted_by)
     values
       ('55555555-5555-5555-5555-55555555f001', 10000, 'upi', 'approved',
        'Down payment via UPI', '11111111-1111-1111-1111-11111111f001') $$,
  'mixed-mode payment record insert succeeds'
);

-- 4. amount_paid on the order sums all approved records regardless of mode.
select is(
  (select amount_paid from public.orders where id = :'order_uid'::uuid),
  75000::numeric,
  'sync_order_amount_paid aggregates bajaj_finserv + snapmint + upi into orders.amount_paid'
);

select * from finish();

rollback;