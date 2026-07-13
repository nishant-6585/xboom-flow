-- pgTAP: nudge_enquiry RPC
-- 1) sales nudges own pending enquiry → is_nudge row + supply_chain broadcast; status unchanged
-- 2) second nudge within 4h → nudge_cooldown
-- 3) nudge on 'responded' → not_waiting_on_supply
-- 4) supply_chain reply after a nudge still flips follow_up → responded

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

set local role postgres;

\set sc_uid    'aaaa9999-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set sales_uid 'bbbb9999-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
\set enq_a     'ccc99991-cccc-cccc-cccc-cccccccccccc'
\set enq_b     'ccc99992-cccc-cccc-cccc-cccccccccccc'

insert into auth.users (id, email, instance_id, aud, role) values
  (:'sc_uid'::uuid,    'nudge-sc@test.local',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'sales_uid'::uuid, 'nudge-sales@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  (:'sc_uid'::uuid,    'supply_chain'),
  (:'sales_uid'::uuid, 'sales')
on conflict (user_id, role) do nothing;

insert into public.profiles (id, full_name, is_approved) values
  (:'sc_uid'::uuid,    'SC N', true),
  (:'sales_uid'::uuid, 'Sales N', true)
on conflict (id) do update set is_approved = true;

-- Two enquiries owned by the salesperson: A pending, B already responded
insert into public.enquiries
  (id, product_name, product_code, quantity, customer_name, customer_company,
   sales_person_id, sales_person_name, urgency, status)
values
  (:'enq_a'::uuid, 'Drone A', 'DA', 1, 'Cust A', 'Co A',
   :'sales_uid'::uuid, 'Sales N', 'medium', 'pending'),
  (:'enq_b'::uuid, 'Drone B', 'DB', 1, 'Cust B', 'Co B',
   :'sales_uid'::uuid, 'Sales N', 'medium', 'responded');

update public.enquiries set responded_at = now() - interval '1 hour',
                            responded_by = :'sc_uid'::uuid,
                            responded_by_name = 'SC N'
  where id = :'enq_b'::uuid;

create or replace function pg_temp.as_user(_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end$$;

-- 1) Salesperson nudges the pending enquiry
select pg_temp.as_user(:'sales_uid'::uuid);
select lives_ok($$ select public.nudge_enquiry(:'enq_a'::uuid) $$,
  'sales owner can nudge pending enquiry');
reset role;

select is(
  (select count(*)::int from public.enquiry_messages
     where enquiry_id = :'enq_a'::uuid and is_nudge = true),
  1,
  'exactly one is_nudge=true row inserted');

select is(
  (select count(*)::int from public.notifications
     where enquiry_id = :'enq_a'::uuid and type = 'enquiry_nudge' and target_role = 'supply_chain'),
  1,
  'supply_chain broadcast notification created');

select is(
  (select status from public.enquiries where id = :'enq_a'::uuid),
  'pending',
  'nudge does not change enquiry status');

-- 2) Second nudge within 4h → nudge_cooldown
select pg_temp.as_user(:'sales_uid'::uuid);
select throws_like($$ select public.nudge_enquiry(:'enq_a'::uuid) $$,
  '%nudge_cooldown%',
  'second nudge within 4h is rejected with nudge_cooldown');
reset role;

-- 3) Nudge on responded enquiry → not_waiting_on_supply
select pg_temp.as_user(:'sales_uid'::uuid);
select throws_like($$ select public.nudge_enquiry(:'enq_b'::uuid) $$,
  '%not_waiting_on_supply%',
  'nudge on responded enquiry raises not_waiting_on_supply');
reset role;

-- 4) Move enquiry A to follow_up (simulate sales follow-up after a response),
--    then supply_chain reply must flip it to responded even though a nudge exists.
update public.enquiries set status = 'follow_up',
                            responded_at = now() - interval '30 minutes',
                            responded_by = :'sc_uid'::uuid,
                            responded_by_name = 'SC N'
  where id = :'enq_a'::uuid;

select pg_temp.as_user(:'sc_uid'::uuid);
insert into public.enquiry_messages
  (enquiry_id, sender_id, sender_name, sender_role, message)
values
  (:'enq_a'::uuid, :'sc_uid'::uuid, 'SC N', 'supply_chain', 'Here you go');
reset role;

select is(
  (select status from public.enquiries where id = :'enq_a'::uuid),
  'responded',
  'supply_chain reply after a nudge still flips follow_up → responded');

select * from finish();
rollback;