-- pgTAP: list_sales_attribution_candidates RPC
-- 1) supply_chain caller receives the sales/sales_manager candidates
-- 2) admin and sales_manager also receive them
-- 3) unrelated roles (sales, hr) are denied with permission_denied
-- 4) anonymous callers are denied
-- 5) SYSTEM/unapproved profiles are filtered out

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

set local role postgres;

\set sc_uid    'a11a1111-a11a-a11a-a11a-a11a11a11a11'
\set sm_uid    'a22a2222-a22a-a22a-a22a-a22a22a22a22'
\set adm_uid   'a33a3333-a33a-a33a-a33a-a33a33a33a33'
\set sales_uid 'a44a4444-a44a-a44a-a44a-a44a44a44a44'
\set hr_uid    'a55a5555-a55a-a55a-a55a-a55a55a55a55'
\set sales2    'a66a6666-a66a-a66a-a66a-a66a66a66a66'
\set unappr    'a77a7777-a77a-a77a-a77a-a77a77a77a77'

insert into auth.users (id, email, instance_id, aud, role) values
  (:'sc_uid'::uuid,    'lsac-sc@test.local',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'sm_uid'::uuid,    'lsac-sm@test.local',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'adm_uid'::uuid,   'lsac-adm@test.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'sales_uid'::uuid, 'lsac-sales@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'hr_uid'::uuid,    'lsac-hr@test.local',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'sales2'::uuid,    'lsac-sales2@test.local','00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'unappr'::uuid,    'lsac-unappr@test.local','00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  (:'sc_uid'::uuid,    'supply_chain'),
  (:'sm_uid'::uuid,    'sales_manager'),
  (:'adm_uid'::uuid,   'admin'),
  (:'sales_uid'::uuid, 'sales'),
  (:'hr_uid'::uuid,    'hr'),
  (:'sales2'::uuid,    'sales'),
  (:'unappr'::uuid,    'sales')
on conflict (user_id, role) do nothing;

insert into public.profiles (user_id, name, is_approved) values
  (:'sc_uid'::uuid,    'SC User',           true),
  (:'sm_uid'::uuid,    'SalesMgr One',      true),
  (:'adm_uid'::uuid,   'Admin One',         true),
  (:'sales_uid'::uuid, 'Sales One',         true),
  (:'hr_uid'::uuid,    'HR One',            true),
  (:'sales2'::uuid,    'Sales Two',         true),
  (:'unappr'::uuid,    'Unapproved Sales',  false)
on conflict (user_id) do update set name = excluded.name, is_approved = excluded.is_approved;

create or replace function pg_temp.as_user(_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end$$;

-- 1) supply_chain sees sales + sales_manager users
select pg_temp.as_user(:'sc_uid'::uuid);
select ok(
  (select count(*) from public.list_sales_attribution_candidates()
     where user_id in (:'sales_uid'::uuid, :'sm_uid'::uuid, :'sales2'::uuid)) = 3,
  'supply_chain receives sales + sales_manager candidates');
select ok(
  (select count(*) from public.list_sales_attribution_candidates()
     where user_id = :'unappr'::uuid) = 0,
  'unapproved profiles are filtered out');
select ok(
  (select role from public.list_sales_attribution_candidates()
     where user_id = :'sm_uid'::uuid) = 'sales_manager',
  'sales_manager role wins over sales in returned rows');
reset role;

-- 2) sales_manager also allowed
select pg_temp.as_user(:'sm_uid'::uuid);
select ok(
  (select count(*) from public.list_sales_attribution_candidates()) >= 3,
  'sales_manager can call the RPC');
reset role;

-- 3) admin also allowed
select pg_temp.as_user(:'adm_uid'::uuid);
select ok(
  (select count(*) from public.list_sales_attribution_candidates()) >= 3,
  'admin can call the RPC');
reset role;

-- 4) sales rep denied
select pg_temp.as_user(:'sales_uid'::uuid);
select throws_like(
  $$ select * from public.list_sales_attribution_candidates() $$,
  '%permission_denied%',
  'sales rep is denied');
reset role;

-- 5) hr denied
select pg_temp.as_user(:'hr_uid'::uuid);
select throws_like(
  $$ select * from public.list_sales_attribution_candidates() $$,
  '%permission_denied%',
  'hr is denied');
reset role;

-- 6) anonymous denied
set local role anon;
select throws_like(
  $$ select * from public.list_sales_attribution_candidates() $$,
  '%permission_denied%',
  'anonymous is denied');
reset role;

select * from finish();
rollback;