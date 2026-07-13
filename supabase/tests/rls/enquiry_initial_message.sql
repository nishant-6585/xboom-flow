-- pgTAP: initial thread messages (is_initial = true) that accompany enquiry
-- creation must NOT generate a duplicate 'enquiry_message' notification, must
-- NOT flip the enquiry off 'pending' status, and normal follow-up messages
-- must still generate notifications as before.
--
-- Run with: supabase test db

begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

set local role postgres;

\set sc_uid    'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set sales_uid 'bbbb3333-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
\set enq_id    'ccc33333-cccc-cccc-cccc-cccccccccccc'

insert into auth.users (id, email, instance_id, aud, role) values
  (:'sc_uid'::uuid,    'init-sc@test.local',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'sales_uid'::uuid, 'init-sales@test.local',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  (:'sc_uid'::uuid,    'supply_chain'),
  (:'sales_uid'::uuid, 'sales')
on conflict (user_id, role) do nothing;

insert into public.profiles (id, full_name, is_approved) values
  (:'sc_uid'::uuid,    'SC User', true),
  (:'sales_uid'::uuid, 'Sales User', true)
on conflict (id) do update set is_approved = true;

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

-- Salesperson creates the enquiry then posts an initial thread message.
select pg_temp.as_user(:'sales_uid'::uuid);

insert into public.enquiries
  (id, product_name, product_code, quantity, customer_name, customer_company,
   sales_person_id, sales_person_name, urgency, status)
values
  (:'enq_id'::uuid, 'Test Drone X', 'TDX', 1, 'Cust I', 'Co I',
   :'sales_uid'::uuid, 'Sales User', 'medium', 'pending');

insert into public.enquiry_messages
  (enquiry_id, sender_id, sender_name, sender_role, message, is_initial)
values
  (:'enq_id'::uuid, :'sales_uid'::uuid, 'Sales User', 'sales',
   'Need quote and lead time please', true);

reset role;

-- 1) Initial message row was persisted with is_initial=true.
select is(
  (select count(*)::int from public.enquiry_messages
     where enquiry_id = :'enq_id'::uuid and is_initial = true),
  1,
  'initial thread message exists with is_initial=true'
);

-- 2) No 'enquiry_message' notification was created for the initial message.
select is(
  (select count(*)::int from public.notifications
     where enquiry_id = :'enq_id'::uuid and type = 'enquiry_message'),
  0,
  'initial sales message does NOT create an enquiry_message notification'
);

-- 3) Enquiry status is unchanged (still pending) — sales messages only flip
--    responded → follow_up, so an initial message on a pending enquiry is a
--    no-op for the status lifecycle trigger.
select is(
  (select status from public.enquiries where id = :'enq_id'::uuid),
  'pending',
  'initial sales message leaves enquiry status = pending'
);

-- Now the salesperson posts a normal (non-initial) follow-up message.
-- Status is still pending, so sync_enquiry_status_from_thread leaves it alone,
-- but notify_on_enquiry_message MUST fire (default is_initial=false).
select pg_temp.as_user(:'sales_uid'::uuid);

insert into public.enquiry_messages
  (enquiry_id, sender_id, sender_name, sender_role, message)
values
  (:'enq_id'::uuid, :'sales_uid'::uuid, 'Sales User', 'sales', 'Any update?');

reset role;

select is(
  (select count(*)::int from public.notifications
     where enquiry_id = :'enq_id'::uuid and type = 'enquiry_message'),
  1,
  'normal (non-initial) sales message creates exactly one enquiry_message notification'
);

select is(
  (select status from public.enquiries where id = :'enq_id'::uuid),
  'pending',
  'follow-up sales message on still-pending enquiry keeps status = pending'
);

select * from finish();
rollback;
