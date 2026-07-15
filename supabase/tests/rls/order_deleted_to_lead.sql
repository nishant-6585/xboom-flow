-- pgTAP: soft-deleting an order flows the customer back into the lead funnel.
-- Covers: website delete → lead, manual+enquiry delete → enquiry lost,
-- manual with no linkage → generic lead, re-delete dedupe, won enquiry untouched.

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

set local role postgres;

\set adm_uid   'aaaadd11-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set ord_web   'dddd0001-dddd-dddd-dddd-dddddddddd01'
\set ord_man   'dddd0002-dddd-dddd-dddd-dddddddddd02'
\set ord_orph  'dddd0003-dddd-dddd-dddd-dddddddddd03'
\set ord_won   'dddd0004-dddd-dddd-dddd-dddddddddd04'
\set enq_open  'dddd0005-dddd-dddd-dddd-dddddddddd05'
\set enq_won   'dddd0006-dddd-dddd-dddd-dddddddddd06'

insert into auth.users (id, email, instance_id, aud, role) values
  (:'adm_uid'::uuid, 'del-admin@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.profiles (id, full_name, is_approved) values
  (:'adm_uid'::uuid, 'Delete Admin', true)
on conflict (id) do update set is_approved = true;

insert into public.user_roles (user_id, role) values
  (:'adm_uid'::uuid, 'admin')
on conflict do nothing;

-- Seed enquiries (open + won).
insert into public.enquiries (id, customer_name, customer_phone, product_name, status, order_outcome)
values
  (:'enq_open'::uuid, 'Enq Open', '9990001', 'Drone A', 'new', null),
  (:'enq_won'::uuid,  'Enq Won',  '9990002', 'Drone B', 'new', 'won')
on conflict (id) do nothing;

-- Seed orders.
insert into public.orders
  (id, order_number, external_id, source, lead_source,
   customer_name, customer_phone, customer_email, customer_company,
   product_name, total_sales_amount, order_date, status, payment_status,
   enquiry_id)
values
  (:'ord_web'::uuid,  'DEL-WEB-1',  'WOO-DEL-1', 'website', 'website',
   'Web Cust', '9111', 'w@t.com', 'WebCo', 'Website Drone', 1000, now(), 'po_received', 'pending', null),
  (:'ord_man'::uuid,  'DEL-MAN-1',  null, 'manual', 'manual',
   'Man Cust', '9222', 'm@t.com', 'ManCo', 'Manual Drone', 2000, now(), 'po_received', 'pending', :'enq_open'::uuid),
  (:'ord_orph'::uuid, 'DEL-ORPH-1', null, 'manual', 'referral',
   'Orph Cust', '9333', 'o@t.com', 'OrphCo', 'Orphan Drone', 3000, now(), 'po_received', 'pending', null),
  (:'ord_won'::uuid,  'DEL-WON-1',  null, 'manual', 'manual',
   'Won Cust', '9444', 'wn@t.com', 'WonCo', 'Won Drone', 4000, now(), 'po_received', 'pending', :'enq_won'::uuid);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'adm_uid', true);
select set_config('request.jwt.claims', json_build_object('sub', :'adm_uid', 'role', 'authenticated')::text, true);

-- ============== 1. WEBSITE delete → new lead + domain_event ==============
update public.orders
  set deleted_at = now(), delete_reason = 'test website delete'
  where id = :'ord_web'::uuid;

select ok(
  exists(select 1 from public.leads
         where form_type='website_order_deleted' and subject like '%DEL-WEB-1%'),
  'website order delete creates website_order_deleted lead'
);
select ok(
  exists(select 1 from public.domain_events
         where event_type='order.deleted_to_lead' and entity_id = :'ord_web'::uuid
           and payload->>'path_taken' = 'website_lead_created'),
  'website delete logs order.deleted_to_lead with website_lead_created'
);

-- Re-delete (simulate undelete + redelete): reset deleted_at, then delete again.
set local role postgres;
update public.orders set deleted_at = null where id = :'ord_web'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'adm_uid', true);
update public.orders
  set deleted_at = now(), delete_reason = 'redelete'
  where id = :'ord_web'::uuid;

select is(
  (select count(*)::int from public.leads
     where form_type='website_order_deleted' and subject like '%DEL-WEB-1%'),
  1,
  're-delete of the same website order does not create a duplicate lead'
);

-- ============== 2. MANUAL delete with enquiry_id → enquiry lost, NO lead ==============
update public.orders
  set deleted_at = now(), delete_reason = 'customer changed mind'
  where id = :'ord_man'::uuid;

select is(
  (select order_outcome from public.enquiries where id = :'enq_open'::uuid),
  'lost',
  'manual delete with enquiry_id flips enquiry to lost'
);
select like(
  (select lost_reason_notes from public.enquiries where id = :'enq_open'::uuid),
  '%DEL-MAN-1 deleted: customer changed mind%',
  'enquiry lost_reason_notes contains order_number and delete_reason'
);
select is(
  (select count(*)::int from public.leads
     where form_type in ('order_deleted','website_order_deleted') and subject like '%DEL-MAN-1%'),
  0,
  'manual delete with enquiry linkage does NOT create a leads row'
);
select ok(
  exists(select 1 from public.domain_events
         where event_type='order.deleted_to_lead' and entity_id = :'ord_man'::uuid
           and payload->>'path_taken' = 'enquiry_marked_lost'),
  'manual+enquiry delete logs enquiry_marked_lost'
);

-- ============== 3. MANUAL delete with NO linkage → generic lead ==============
update public.orders
  set deleted_at = now(), delete_reason = 'orphan test'
  where id = :'ord_orph'::uuid;

select ok(
  exists(select 1 from public.leads
         where form_type='order_deleted' and subject like '%DEL-ORPH-1%'),
  'orphan manual delete creates generic order_deleted lead'
);
select ok(
  exists(select 1 from public.domain_events
         where event_type='order.deleted_to_lead' and entity_id = :'ord_orph'::uuid
           and payload->>'path_taken' = 'generic_lead_created'),
  'orphan manual delete logs generic_lead_created'
);

-- ============== 4. WON enquiry untouched, still logs domain_event ==============
update public.orders
  set deleted_at = now(), delete_reason = 'accounting cleanup'
  where id = :'ord_won'::uuid;

select is(
  (select order_outcome from public.enquiries where id = :'enq_won'::uuid),
  'won',
  'won enquiry is not downgraded when linked order is deleted'
);
select ok(
  exists(select 1 from public.domain_events
         where event_type='order.deleted_to_lead' and entity_id = :'ord_won'::uuid
           and payload->>'path_taken' = 'enquiry_skipped_won'),
  'won-enquiry delete still logs domain_event with enquiry_skipped_won'
);
select is(
  (select count(*)::int from public.leads
     where subject like '%DEL-WON-1%'),
  0,
  'won-enquiry delete creates no leads row'
);

select * from finish();
rollback;