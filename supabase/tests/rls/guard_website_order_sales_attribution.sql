-- pgTAP: guard_website_order_sales_attribution normalizer
-- Verifies that a direct UPDATE that assigns a real salesperson to a
-- Woo-linked (external_id present) website order automatically flips
-- source -> 'manual', locks attribution, and preserves lead_source.
-- Also verifies:
--   * assigning back to the system ingestion user is a no-op
--   * assigning to a rep on a non-Woo (external_id NULL) row is a no-op
--   * the RPC path (app.attribution_rpc='on') is not double-normalized

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

set local role postgres;

\set rep_uid   'dddd9911-dddd-dddd-dddd-dddddddddddd'
\set sys_uid   'a8050cc3-7d17-44ac-a083-d8023d505331'
\set ord_woo1  'eeee9911-eeee-eeee-eeee-eeeeeeeeeee1'
\set ord_woo2  'eeee9912-eeee-eeee-eeee-eeeeeeeeeee2'
\set ord_woo3  'eeee9913-eeee-eeee-eeee-eeeeeeeeeee3'
\set ord_man   'eeee9914-eeee-eeee-eeee-eeeeeeeeeee4'

insert into auth.users (id, email, instance_id, aud, role) values
  (:'rep_uid'::uuid, 'guard-rep@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.profiles (id, full_name, is_approved) values
  (:'rep_uid'::uuid, 'Rep One', true)
on conflict (id) do update set is_approved = true;

-- Seed 4 orders: 3 Woo-linked, 1 pure manual.
insert into public.orders
  (id, order_number, external_id, source, lead_source,
   sales_person_id, sales_person_name, sales_attribution_locked,
   status, payment_status, total_sales_amount, amount_paid, order_date)
values
  (:'ord_woo1'::uuid, 'GRD-1', 'WOO-9991', 'website', 'website',
   :'sys_uid'::uuid, 'System', false,
   'po_received', 'full', 1000, 1000, now()),
  (:'ord_woo2'::uuid, 'GRD-2', 'WOO-9992', 'website', 'website',
   :'sys_uid'::uuid, 'System', false,
   'po_received', 'full', 1000, 1000, now()),
  (:'ord_woo3'::uuid, 'GRD-3', 'WOO-9993', 'website', 'website',
   :'sys_uid'::uuid, 'System', false,
   'po_received', 'full', 1000, 1000, now()),
  (:'ord_man'::uuid,  'GRD-4', NULL,       'manual',  NULL,
   :'sys_uid'::uuid, 'System', false,
   'po_received', 'full', 1000, 1000, now());

-- Case 1: direct UPDATE to a real rep on a Woo-linked website order
-- -> normalize to manual, lock, keep lead_source, stamp attributed_at.
update public.orders
   set sales_person_id = :'rep_uid'::uuid,
       sales_person_name = 'Rep One'
 where id = :'ord_woo1'::uuid;

select is(
  (select source from public.orders where id = :'ord_woo1'::uuid),
  'manual',
  'Woo-linked direct update flips source to manual'
);
select is(
  (select sales_attribution_locked from public.orders where id = :'ord_woo1'::uuid),
  true,
  'Woo-linked direct update locks attribution'
);
select is(
  (select lead_source from public.orders where id = :'ord_woo1'::uuid),
  'website',
  'lead_source is preserved as website provenance'
);
select isnt(
  (select attributed_at from public.orders where id = :'ord_woo1'::uuid),
  null,
  'attributed_at is stamped when guard normalizes'
);

-- Case 2: reassign back to system user on a website row -> no-op.
update public.orders
   set sales_person_id = :'sys_uid'::uuid,
       sales_person_name = 'System'
 where id = :'ord_woo2'::uuid;

select is(
  (select source from public.orders where id = :'ord_woo2'::uuid),
  'website',
  'assigning back to system user is NOT normalized'
);

-- Case 3: pure manual order (no external_id) -> guard ignores it.
update public.orders
   set sales_person_id = :'rep_uid'::uuid,
       sales_person_name = 'Rep One'
 where id = :'ord_man'::uuid;

select is(
  (select source from public.orders where id = :'ord_man'::uuid),
  'manual',
  'non-Woo manual order stays manual (guard skipped)'
);
select is(
  (select sales_attribution_locked from public.orders where id = :'ord_man'::uuid),
  false,
  'non-Woo manual order is NOT auto-locked by the guard'
);

-- Case 4: RPC path — app.attribution_rpc='on' means the RPC already sets
-- these fields, so the guard must leave NEW.source alone. We emulate the
-- RPC by setting the GUC and manually writing source/lock ourselves.
set local app.attribution_rpc = 'on';
update public.orders
   set sales_person_id = :'rep_uid'::uuid,
       sales_person_name = 'Rep One',
       source = 'manual',
       sales_attribution_locked = true,
       attributed_at = now()
 where id = :'ord_woo3'::uuid;
reset app.attribution_rpc;

select is(
  (select source from public.orders where id = :'ord_woo3'::uuid),
  'manual',
  'RPC path leaves source=manual (already set by RPC)'
);
select is(
  (select sales_attribution_locked from public.orders where id = :'ord_woo3'::uuid),
  true,
  'RPC path leaves attribution lock intact'
);

select * from finish();
rollback;