-- pgTAP: quote-details UPDATE on public.enquiries auto-mirrors the quote
-- into public.enquiry_messages exactly once, does not emit an extra
-- enquiry_message notification, and status-only flips never mirror.
--
-- Run with: supabase test db

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

set local role postgres;

\set sc_uid    '11111111-1111-1111-1111-111111111111'
\set sales_uid '22222222-2222-2222-2222-222222222222'
\set enq_a     '33333333-3333-3333-3333-333333333333'
\set enq_b     '44444444-4444-4444-4444-444444444444'

insert into auth.users (id, email, instance_id, aud, role) values
  (:'sc_uid'::uuid,    'qm-sc@test.local',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'sales_uid'::uuid, 'qm-sales@test.local',
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
  (:'enq_a'::uuid, 'Test Drone', 'TD-A', 1, 'Cust A', 'Co A',
   :'sales_uid'::uuid, 'Sales User', 'medium', 'pending'),
  (:'enq_b'::uuid, 'Test Drone', 'TD-B', 1, 'Cust B', 'Co B',
   :'sales_uid'::uuid, 'Sales User', 'medium', 'pending');

-- =========================================================
-- 1) Structured quote update on enq_a → exactly ONE mirror row
--    with is_quote_mirror = true and the responder's name.
-- =========================================================
update public.enquiries
   set status = 'responded',
       responded_at = now(),
       responded_by = :'sc_uid'::uuid,
       responded_by_name = 'SC User',
       response_pricing = '4500',
       response_availability = 'In Stock',
       response_lead_time = '5-7 days'
 where id = :'enq_a'::uuid;

select is(
  (select count(*)::int from public.enquiry_messages
     where enquiry_id = :'enq_a'::uuid and is_quote_mirror = true),
  1,
  'quote update creates exactly ONE is_quote_mirror message'
);

select is(
  (select sender_name from public.enquiry_messages
     where enquiry_id = :'enq_a'::uuid and is_quote_mirror = true limit 1),
  'SC User',
  'mirror row is stamped with the responder name'
);

select is(
  (select sender_role from public.enquiry_messages
     where enquiry_id = :'enq_a'::uuid and is_quote_mirror = true limit 1),
  'supply_chain',
  'mirror row is stamped with sender_role = supply_chain'
);

select ok(
  (select message like '%Price: 4500%'
     and message like '%Availability: In Stock%'
     and message like '%Lead time: 5-7 days%'
   from public.enquiry_messages
   where enquiry_id = :'enq_a'::uuid and is_quote_mirror = true limit 1),
  'mirror message contains price, availability, and lead time'
);

-- =========================================================
-- 2) The mirror row must NOT create an enquiry_message notification
--    (only the enquiry_response notification is expected here).
-- =========================================================
select is(
  (select count(*)::int from public.notifications
     where enquiry_id = :'enq_a'::uuid and type = 'enquiry_message'),
  0,
  'mirror row does NOT emit an enquiry_message notification'
);

select is(
  (select count(*)::int from public.notifications
     where enquiry_id = :'enq_a'::uuid and type = 'enquiry_response'),
  1,
  'structured response still emits ONE enquiry_response notification'
);

-- =========================================================
-- 3) Status-only flip on enq_b → NO mirror row.
-- =========================================================
update public.enquiries set status = 'follow_up' where id = :'enq_b'::uuid;

select is(
  (select count(*)::int from public.enquiry_messages
     where enquiry_id = :'enq_b'::uuid and is_quote_mirror = true),
  0,
  'status-only update does NOT create a mirror row'
);

-- =========================================================
-- 4) Sales reply after quote → status flips back to follow_up
--    (existing thread-sync behavior unchanged).
-- =========================================================
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

select pg_temp.as_user(:'sales_uid'::uuid);

insert into public.enquiry_messages
  (enquiry_id, sender_id, sender_name, sender_role, message)
values
  (:'enq_a'::uuid, :'sales_uid'::uuid, 'Sales User', 'sales', 'Any update?');

reset role;

select is(
  (select status from public.enquiries where id = :'enq_a'::uuid),
  'follow_up',
  'sales reply after quote flips responded → follow_up'
);

-- Supply chain replies again → back to responded, unchanged behavior.
select pg_temp.as_user(:'sc_uid'::uuid);

insert into public.enquiry_messages
  (enquiry_id, sender_id, sender_name, sender_role, message)
values
  (:'enq_a'::uuid, :'sc_uid'::uuid, 'SC User', 'supply_chain', 'Shipping Monday');

reset role;

select is(
  (select status from public.enquiries where id = :'enq_a'::uuid),
  'responded',
  'supply_chain reply flips follow_up → responded (unchanged)'
);

select * from finish();
rollback;