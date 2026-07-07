-- pgTAP tests for the item-driven total_sales_amount exception added to
-- guard_orders_sensitive_updates (ticket TKT2600153 follow-up).
--
-- Scenario the guard now supports:
--   A sales rep adds or removes an order_items row and then updates
--   orders.total_sales_amount to match the recomputed items sum
--   (minus discount, plus delivery_charges). The write must SUCCEED.
--
-- Scenario the guard must still block:
--   A sales rep hand-edits orders.total_sales_amount to a value that does
--   NOT match the items sum. The write must RAISE 42501.
--
-- Run with: supabase test db

begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

set local role postgres;

\set admin_uid      '11111111-aaaa-4aaa-8aaa-111111111111'
\set sales_uid      '33333333-cccc-4ccc-8ccc-333333333333'
\set order_uid      '55555555-eeee-4eee-8eee-555555555555'
\set item_uid       '66666666-ffff-4fff-8fff-666666666666'

insert into auth.users (id, email, instance_id, aud, role) values
  (:'admin_uid'::uuid, 'items-guard-admin@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'sales_uid'::uuid, 'items-guard-sales@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  (:'admin_uid'::uuid, 'admin'),
  (:'sales_uid'::uuid, 'sales')
on conflict (user_id, role) do nothing;

insert into public.profiles (id, full_name, is_approved) values
  (:'sales_uid'::uuid, 'Items Guard Sales', true)
on conflict (id) do update set is_approved = true;

-- Seed an order + a single line item worth 100000, matching total.
insert into public.orders
  (id, order_number, customer_name, sales_person_id, sales_person_name,
   product_name, product_code, quantity, created_by, status, payment_status,
   selling_price, amount_paid, delivery_mode,
   total_sales_amount, discount_amount, delivery_charges)
values
  (:'order_uid'::uuid, 'ITEMS-GUARD-0001', 'Items Guard Customer',
   :'sales_uid'::uuid, 'Items Guard Sales',
   'Test Drone', 'ITEMS-SKU-01', 1, :'admin_uid'::uuid,
   'po_received', 'unpaid', 100000, 0, 'courier',
   100000, 0, 0);

insert into public.order_items
  (id, order_id, product_name, product_category, quantity, unit_price, status)
values
  (:'item_uid'::uuid, :'order_uid'::uuid, 'Test Drone', 'Consumer Drones', 1, 100000, 'draft');

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
-- Case 1: Sales rep adds a new line item (worth 50000) and updates
-- total_sales_amount to 150000 to match. Must SUCCEED.
-- ===========================================================================
select pg_temp.as_user(:'sales_uid'::uuid);

select lives_ok(
  $$ insert into public.order_items
       (order_id, product_name, product_category, quantity, unit_price, status)
     values
       ('55555555-eeee-4eee-8eee-555555555555'::uuid,
        'Second Item', 'Consumer Drones', 1, 50000, 'draft') $$,
  'sales can INSERT a new order_items row'
);

select lives_ok(
  $$ update public.orders
        set total_sales_amount = 150000
      where id = '55555555-eeee-4eee-8eee-555555555555' $$,
  'sales can UPDATE orders.total_sales_amount when it matches items sum (100000 + 50000)'
);

-- ===========================================================================
-- Case 2: Sales rep tries to hand-edit total_sales_amount away from the
-- items sum. Must RAISE 42501.
-- ===========================================================================
select throws_ok(
  $$ update public.orders
        set total_sales_amount = 999999
      where id = '55555555-eeee-4eee-8eee-555555555555' $$,
  '42501',
  null,
  'sales CANNOT hand-edit orders.total_sales_amount away from items sum'
);

select * from finish();

rollback;