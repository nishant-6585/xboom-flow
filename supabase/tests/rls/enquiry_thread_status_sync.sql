-- pgTAP: enquiry message thread synchronizes enquiries.status per role rules,
-- and first-response side effects (supplier validation task) are not duplicated
-- when a follow-up cycle re-flips the enquiry to 'responded'.
--
-- Run with: supabase test db

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

set local role postgres;

\set sc_uid    'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set sales_uid 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
\set enq_pend  'ccc11111-cccc-cccc-cccc-cccccccccccc'
\set enq_won   'ddd22222-dddd-dddd-dddd-dddddddddddd'
\set enq_struct 'eee33333-eeee-eeee-eeee-eeeeeeeeeeee'

insert into auth.users (id, email, instance_id, aud, role) values
  (:'sc_uid'::uuid,    'thread-sc@test.local',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'sales_uid'::uuid, 'thread-sales@test.local',
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

insert into public.enquiries
  (id, product_name, product_code, quantity, customer_name, customer_company,
   sales_person_id, sales_person_name, urgency, status)
values
  (:'enq_pend'::uuid, 'Test Drone', 'TD-P', 1, 'Cust P', 'Co P',
   :'sales_uid'::uuid, 'Sales User', 'medium', 'pending'),
  (:'enq_won'::uuid,  'Test Drone', 'TD-W', 1, 'Cust W', 'Co W',
   :'sales_uid'::uuid, 'Sales User', 'medium', 'order_won'),
  (:'enq_struct'::uuid, 'Test Drone', 'TD-S', 1, 'Cust S', 'Co S',
   :'sales_uid'::uuid, 'Sales User', 'medium', 'pending');

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

-- ============================================================
-- 1) supply_chain sends first thread message on pending enquiry
-- ============================================================
select pg_temp.as_user(:'sc_uid'::uuid);

insert into public.enquiry_messages
  (enquiry_id, sender_id, sender_name, sender_role, message)
values
  (:'enq_pend'::uuid, :'sc_uid'::uuid, 'SC User', 'supply_chain', 'Hello');

reset role;

select is(
  (select status from public.enquiries where id = :'enq_pend'::uuid),
  'responded',
  'supply_chain thread reply on pending → status = responded'
);

select isnt(
  (select responded_at from public.enquiries where id = :'enq_pend'::uuid),
  null,
  'first thread response stamps responded_at'
);

select is(
  (select count(*)::int from public.tasks
     where enquiry_id = :'enq_pend'::uuid
       and task_type = 'supplier_validation'),
  1,
  'exactly ONE supplier_validation task after first response via thread'
);

-- Notification dedupe: thread-first response must emit ONLY 'enquiry_message',
-- not the redundant 'enquiry_response' toast (guarded via pg_trigger_depth).
select is(
  (select count(*)::int from public.notifications
     where enquiry_id = :'enq_pend'::uuid and type = 'enquiry_message'),
  1,
  'thread first-response emits exactly ONE enquiry_message notification'
);

select is(
  (select count(*)::int from public.notifications
     where enquiry_id = :'enq_pend'::uuid and type = 'enquiry_response'),
  0,
  'thread first-response does NOT emit enquiry_response (nested trigger suppressed)'
);

-- capture the first responded_at to prove it does not move on later flips
select responded_at as first_resp_at
  into temp table _first_resp
  from public.enquiries where id = :'enq_pend'::uuid;

-- ============================================================
-- 2) sales user replies on a responded enquiry → follow_up
-- ============================================================
select pg_temp.as_user(:'sales_uid'::uuid);

insert into public.enquiry_messages
  (enquiry_id, sender_id, sender_name, sender_role, message)
values
  (:'enq_pend'::uuid, :'sales_uid'::uuid, 'Sales User', 'sales', 'Any update?');

reset role;

select is(
  (select status from public.enquiries where id = :'enq_pend'::uuid),
  'follow_up',
  'sales thread reply on responded → status = follow_up'
);

-- ============================================================
-- 3) supply_chain replies again → back to responded, responded_at unchanged,
--    still exactly one supplier_validation task
-- ============================================================
select pg_temp.as_user(:'sc_uid'::uuid);

insert into public.enquiry_messages
  (enquiry_id, sender_id, sender_name, sender_role, message)
values
  (:'enq_pend'::uuid, :'sc_uid'::uuid, 'SC User', 'supply_chain', 'Update here');

reset role;

select is(
  (select status from public.enquiries where id = :'enq_pend'::uuid),
  'responded',
  'supply_chain reply on follow_up → status = responded again'
);

select is(
  (select responded_at from public.enquiries where id = :'enq_pend'::uuid),
  (select first_resp_at from _first_resp),
  'responded_at UNCHANGED across follow_up → responded flip'
);

select is(
  (select count(*)::int from public.tasks
     where enquiry_id = :'enq_pend'::uuid
       and task_type = 'supplier_validation'),
  1,
  'still exactly ONE supplier_validation task after follow-up cycle'
);

-- ============================================================
-- 4) sales user posts on an order_won enquiry → status stays order_won
-- ============================================================
select pg_temp.as_user(:'sales_uid'::uuid);

insert into public.enquiry_messages
  (enquiry_id, sender_id, sender_name, sender_role, message)
values
  (:'enq_won'::uuid, :'sales_uid'::uuid, 'Sales User', 'sales', 'Any followup');

reset role;

select is(
  (select status from public.enquiries where id = :'enq_won'::uuid),
  'order_won',
  'sales thread message on order_won enquiry does NOT change status'
);

-- ============================================================
-- 5) Structured "Submit Response" (direct UPDATE, depth 1) → enquiry_response fires
-- ============================================================
-- Run as postgres to isolate trigger behavior from RLS UPDATE policy
-- (equivalent to a client "Submit Response" call landing as a depth-1 UPDATE).
update public.enquiries
   set status = 'responded',
       responded_at = now(),
       responded_by = :'sc_uid'::uuid,
       responded_by_name = 'SC User',
       response_pricing = '100',
       response_availability = 'In stock'
 where id = :'enq_struct'::uuid;

select is(
  (select count(*)::int from public.notifications
     where enquiry_id = :'enq_struct'::uuid and type = 'enquiry_response'),
  1,
  'structured response path (depth-1 UPDATE) still emits enquiry_response'
);

select * from finish();
rollback;
