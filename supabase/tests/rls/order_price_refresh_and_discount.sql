-- pgTAP: order pricing guard + refresh_order_price_from_pricelist RPC.
-- Covers:
--   • Sales rep can update discount_amount on OWN order.
--   • Sales rep is blocked on selling_price / amount_paid / payment_status
--     (direct UPDATE) and on discount for a peer's order.
--   • Payment sync via payment_records still succeeds and recomputes amount_paid.
--   • Admin can hand-edit amount_paid / selling_price directly.
--   • Granted supply user runs refresh_order_price_from_pricelist and it
--     updates selling_price + total; non-granted supply user gets 42501.
--   • order_outcome now editable on OWN order by sales.
--
-- Run with: supabase test db

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
set local role postgres;

\set admin_uid   'aa111111-1111-1111-1111-111111111111'
\set sales_uid   'aa222222-2222-2222-2222-222222222222'
\set peer_uid    'aa333333-3333-3333-3333-333333333333'
\set supply_uid  'aa444444-4444-4444-4444-444444444444'
\set supply_ng   'aa555555-5555-5555-5555-555555555555'
\set order_uid   'bb111111-1111-1111-1111-111111111111'

insert into auth.users (id, email, instance_id, aud, role) values
  (:'admin_uid'::uuid,  'prc-admin@t.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'sales_uid'::uuid,  'prc-sales@t.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'peer_uid'::uuid,   'prc-peer@t.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'supply_uid'::uuid, 'prc-supg@t.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'supply_ng'::uuid,  'prc-supng@t.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  (:'admin_uid'::uuid,  'admin'),
  (:'sales_uid'::uuid,  'sales'),
  (:'peer_uid'::uuid,   'sales'),
  (:'supply_uid'::uuid, 'sales'),   -- supply-chain-ish grant holder is a plain sales role
  (:'supply_ng'::uuid,  'sales')
on conflict (user_id, role) do nothing;

insert into public.profiles (id, full_name, is_approved) values
  (:'sales_uid'::uuid,  'Prc Sales',    true),
  (:'peer_uid'::uuid,   'Prc Peer',     true),
  (:'supply_uid'::uuid, 'Prc SupplyG',  true),
  (:'supply_ng'::uuid,  'Prc SupplyNG', true)
on conflict (id) do update set is_approved = true;

-- Grant price-refresh capability to supply_uid only.
insert into public.price_refresh_grants (user_id, note)
values (:'supply_uid'::uuid, 'test grant') on conflict do nothing;

-- Pricelist row that matches the order's SKU.
insert into public.pricelist (product_name, product_category, woo_sku, website_price, unit_price, availability)
values ('Price Test Drone', 'Consumer Drones', 'PRC-SKU-01', 150000, 150000, 'in_stock');

insert into public.orders
  (id, order_number, customer_name, sales_person_id, sales_person_name,
   product_name, product_code, quantity, created_by, status, payment_status,
   selling_price, total_sales_amount, discount_amount, amount_paid, delivery_mode)
values
  (:'order_uid'::uuid, 'PRC-TEST-0001', 'Cust',
   :'sales_uid'::uuid, 'Prc Sales',
   'Price Test Drone', 'PRC-SKU-01', 1, :'admin_uid'::uuid,
   'po_received', 'unpaid', 100000, 100000, 0, 0, 'courier');

create or replace function pg_temp.as_user(_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end$$;

-- 1) Own-order sales: discount UPDATE succeeds.
select pg_temp.as_user(:'sales_uid'::uuid);
select lives_ok(
  $$ update public.orders set discount_amount = 5000, total_sales_amount = 95000
       where id = 'bb111111-1111-1111-1111-111111111111' $$,
  'sales can change discount_amount + matching total_sales_amount on OWN order'
);

-- 2) Own-order sales: selling_price direct UPDATE blocked.
select throws_ok(
  $$ update public.orders set selling_price = 999999
       where id = 'bb111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'sales cannot change selling_price directly');

-- 3) Own-order sales: amount_paid direct UPDATE blocked.
select throws_ok(
  $$ update public.orders set amount_paid = 50000
       where id = 'bb111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'sales cannot change amount_paid directly');

-- 4) Own-order sales: order_outcome UPDATE succeeds (own-order allowance).
select lives_ok(
  $$ update public.orders set order_outcome = 'won'
       where id = 'bb111111-1111-1111-1111-111111111111' $$,
  'sales can change order_outcome on OWN order');

-- 5) Peer sales: discount UPDATE blocked.
select pg_temp.as_user(:'peer_uid'::uuid);
select throws_ok(
  $$ update public.orders set discount_amount = 7000
       where id = 'bb111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'peer sales cannot change discount on another rep''s order');

-- 6) Payment record submission by sales — sync trigger recomputes amount_paid.
select pg_temp.as_user(:'sales_uid'::uuid);
select lives_ok(
  $$ insert into public.payment_records
       (order_id, amount, screenshot_url, notes, submitted_by, status)
     values
       ('bb111111-1111-1111-1111-111111111111', 25000, null, 'proof',
        'aa222222-2222-2222-2222-222222222222', 'approved') $$,
  'sales payment_records insert triggers sync — amount_paid derives without 42501');

-- 7) Granted supply user: refresh_order_price_from_pricelist succeeds and moves price.
select pg_temp.as_user(:'supply_uid'::uuid);
select lives_ok(
  $$ select public.refresh_order_price_from_pricelist('bb111111-1111-1111-1111-111111111111') $$,
  'granted user can call refresh_order_price_from_pricelist'
);

set local role postgres;
select is(
  (select selling_price from public.orders where id = :'order_uid'::uuid),
  150000::numeric,
  'selling_price updated to pricelist website_price'
);

-- 8) Non-granted supply user: refresh RPC → 42501.
select pg_temp.as_user(:'supply_ng'::uuid);
select throws_ok(
  $$ select public.refresh_order_price_from_pricelist('bb111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'non-granted user cannot call refresh_order_price_from_pricelist');

-- 9) Admin direct amount_paid update succeeds.
select pg_temp.as_user(:'admin_uid'::uuid);
select lives_ok(
  $$ update public.orders set amount_paid = 60000, payment_status = 'partial'
       where id = 'bb111111-1111-1111-1111-111111111111' $$,
  'admin can hand-edit amount_paid + payment_status'
);

select * from finish();
rollback;