-- pgTAP: sales user can update follow-up note fields on their OWN enquiry,
-- but cannot change any other column, and cannot touch another salesperson's row.
--
-- Run with: supabase test db

begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

set local role postgres;

\set sales1_uid 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
\set sales2_uid 'cccccccc-cccc-cccc-cccc-cccccccccccc'
\set enq1_id    'dddddddd-dddd-dddd-dddd-dddddddddddd'
\set enq2_id    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

insert into auth.users (id, email, instance_id, aud, role) values
  (:'sales1_uid'::uuid, 'rls-enq-sales1@test.local',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'sales2_uid'::uuid, 'rls-enq-sales2@test.local',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  (:'sales1_uid'::uuid, 'sales'),
  (:'sales2_uid'::uuid, 'sales')
on conflict (user_id, role) do nothing;

insert into public.profiles (id, full_name, is_approved) values
  (:'sales1_uid'::uuid, 'Sales One', true),
  (:'sales2_uid'::uuid, 'Sales Two', true)
on conflict (id) do update set is_approved = true;

insert into public.enquiries
  (id, product_name, product_code, quantity, customer_name, customer_company,
   sales_person_id, sales_person_name, urgency, status)
values
  (:'enq1_id'::uuid, 'Test Drone', 'TD-1', 1, 'Cust A', 'Co A',
   :'sales1_uid'::uuid, 'Sales One', 'medium', 'pending'),
  (:'enq2_id'::uuid, 'Test Drone', 'TD-2', 1, 'Cust B', 'Co B',
   :'sales2_uid'::uuid, 'Sales Two', 'medium', 'pending');

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

-- Act as sales1
select pg_temp.as_user(:'sales1_uid'::uuid);

-- Happy path: update own follow-up note
select lives_ok(
  $$ update public.enquiries
       set followup_note = 'Requested callback',
           followup_note_updated_at = now(),
           followup_note_updated_by_name = 'Sales One'
     where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  'sales user CAN update follow-up note on own enquiry'
);

-- Guard: cannot change status
select throws_ok(
  $$ update public.enquiries set status = 'responded'
     where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  '42501', null,
  'sales user CANNOT change status on own enquiry'
);

-- Guard: cannot change response_pricing
select throws_ok(
  $$ update public.enquiries set response_pricing = 'Rs. 1000'
     where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  '42501', null,
  'sales user CANNOT change response_pricing on own enquiry'
);

-- Guard: cannot update another salesperson's row (RLS filter -> 0 rows updated
-- if it slipped past the trigger; we assert via row count).
select is(
  (with u as (
     update public.enquiries
        set followup_note = 'hijack'
      where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
      returning 1
   ) select count(*)::int from u),
  0,
  'sales user CANNOT update another salesperson enquiry follow-up note'
);

select * from finish();
rollback;