-- pgTAP: guard_orders_duplicate_creation
-- 1) Sales user inserting an order that hard-matches an existing website order → raises.
-- 2) Sales user inserting a clearly different order → succeeds.
-- 3) Service-role insert with source='website' matching a manual order → NOT blocked.
--
-- Run with: supabase test db

begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

set local role postgres;

\set sales_uid 'aaaaaaaa-1111-2222-3333-444444444444'
\set web_id    'bbbbbbbb-1111-2222-3333-444444444444'
\set man_id    'cccccccc-1111-2222-3333-444444444444'
\set portal_uid 'dddddddd-1111-2222-3333-444444444444'

insert into auth.users (id, email, instance_id, aud, role) values
  (:'sales_uid'::uuid, 'rls-dupguard-sales@test.local',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  (:'sales_uid'::uuid, 'sales')
on conflict (user_id, role) do nothing;

insert into public.profiles (id, full_name, is_approved) values
  (:'sales_uid'::uuid, 'Guard Tester', true)
on conflict (id) do update set is_approved = true;

-- Portal-style authenticated user: exists in auth, approved profile,
-- but has NO staff role in user_roles.
insert into auth.users (id, email, instance_id, aud, role) values
  (:'portal_uid'::uuid, 'rls-dupguard-portal@test.local',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.profiles (id, full_name, is_approved) values
  (:'portal_uid'::uuid, 'Portal Customer', true)
on conflict (id) do update set is_approved = true;

-- Seed an existing WEBSITE order (as postgres → auth.uid() null, so guard skips).
insert into public.orders
  (id, product_name, product_code, product_category, quantity,
   customer_name, customer_phone, customer_company,
   sales_person_id, sales_person_name,
   order_type, customer_type, status,
   total_sales_amount, order_date, source, external_id, created_by)
values
  (:'web_id'::uuid, 'Test Drone Pro', 'TDP-1', 'drone', 1,
   'Dup Guard Customer', '+919999000011', 'Dup Guard Co',
   :'sales_uid'::uuid, 'Website Order',
   'prepaid', 'b2c', 'po_received',
   50000, current_date, 'website', 'WOO-999001', :'sales_uid'::uuid);

-- Also seed an existing MANUAL order used for test #3.
insert into public.orders
  (id, product_name, product_code, product_category, quantity,
   customer_name, customer_phone, customer_company,
   sales_person_id, sales_person_name,
   order_type, customer_type, status,
   total_sales_amount, order_date, source, external_id, created_by)
values
  (:'man_id'::uuid, 'Test Drone Pro', 'TDP-1', 'drone', 1,
   'Dup Guard Customer 2', '+919999000022', 'Dup Guard Co',
   :'sales_uid'::uuid, 'Sales Rep',
   'prepaid', 'b2c', 'po_received',
   50000, current_date, null, null, :'sales_uid'::uuid);

create or replace function pg_temp.as_user(_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end $$;

-- 1) Sales user tries to create a duplicate of the website order → blocked.
select pg_temp.as_user(:'sales_uid'::uuid);
select throws_ok(
  $$insert into public.orders
     (product_name, product_code, product_category, quantity,
      customer_name, customer_phone, customer_company,
      sales_person_id, sales_person_name,
      order_type, customer_type, status,
      total_sales_amount, order_date, created_by)
   values
     ('Test Drone Pro', 'TDP-1', 'drone', 1,
      'Dup Guard Customer', '+919999000011', 'Dup Guard Co',
      'aaaaaaaa-1111-2222-3333-444444444444'::uuid, 'Guard Tester',
      'prepaid', 'b2c', 'po_received',
      50000, current_date, 'aaaaaaaa-1111-2222-3333-444444444444'::uuid)$$,
  'P0001',
  NULL,
  'sales insert duplicating website order is blocked'
);

-- 2) A clearly different order (different customer + phone + product) → allowed.
select lives_ok(
  $$insert into public.orders
     (product_name, product_code, product_category, quantity,
      customer_name, customer_phone, customer_company,
      sales_person_id, sales_person_name,
      order_type, customer_type, status,
      total_sales_amount, order_date, created_by)
   values
     ('Completely Unrelated Widget', 'CUW-42', 'accessory', 2,
      'Totally Different Person', '+918888777766', 'Other Co',
      'aaaaaaaa-1111-2222-3333-444444444444'::uuid, 'Guard Tester',
      'prepaid', 'b2c', 'po_received',
      2500, current_date, 'aaaaaaaa-1111-2222-3333-444444444444'::uuid)$$,
  'non-duplicate sales insert succeeds'
);

-- 3) Service-role (postgres) insert with source='website' matching the manual
--    order must NOT be blocked (webhook ingest path).
reset role;
select set_config('request.jwt.claims', '', true);
select lives_ok(
  $$insert into public.orders
     (product_name, product_code, product_category, quantity,
      customer_name, customer_phone, customer_company,
      sales_person_id, sales_person_name,
      order_type, customer_type, status,
      total_sales_amount, order_date, source, external_id, created_by)
   values
     ('Test Drone Pro', 'TDP-1', 'drone', 1,
      'Dup Guard Customer 2', '+919999000022', 'Dup Guard Co',
      'aaaaaaaa-1111-2222-3333-444444444444'::uuid, 'Website Order',
      'prepaid', 'b2c', 'po_received',
      50000, current_date, 'website', 'WOO-999002',
      'aaaaaaaa-1111-2222-3333-444444444444'::uuid)$$,
  'service-role website ingest matching a manual order is NOT blocked'
);

-- 4) Portal-style authenticated user (no staff role) calling
--    find_duplicate_orders → must raise 42501.
select pg_temp.as_user(:'portal_uid'::uuid);
select throws_ok(
  $$select * from public.find_duplicate_orders(
      'Dup Guard Customer', '+919999000011', 'Test Drone Pro',
      'TDP-1', current_date, 50000)$$,
  '42501',
  NULL,
  'portal user without staff role cannot call find_duplicate_orders'
);

-- 5) Sales user calling find_duplicate_orders → succeeds.
select pg_temp.as_user(:'sales_uid'::uuid);
select lives_ok(
  $$select * from public.find_duplicate_orders(
      'Dup Guard Customer', '+919999000011', 'Test Drone Pro',
      'TDP-1', current_date, 50000)$$,
  'sales user can call find_duplicate_orders'
);

select * from finish();
rollback;