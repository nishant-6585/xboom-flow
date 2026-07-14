-- pgTAP: comp-off single-visible-request UX
-- (1) Applying compoff leave → 1 pending leave + linked pending credit;
--     credit HIDDEN from list_pending_compoff_credits inbox.
-- (2) Approve leave → credit approved AND redeemed in same call.
-- (3) Reject path → credit link cleared, credit back to pending & visible in inbox.

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

set local role postgres;

\set emp_uid    'aaaa8888-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set hr_uid     'bbbb8888-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
\set emp_id     'ccc88881-cccc-cccc-cccc-cccccccccccc'
\set ledger_id  'ddd88881-dddd-dddd-dddd-dddddddddddd'
\set leave_id   'eee88881-eeee-eeee-eeee-eeeeeeeeeeee'

insert into auth.users (id, email, instance_id, aud, role) values
  (:'emp_uid'::uuid, 'co-emp@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'hr_uid'::uuid,  'co-hr@test.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  (:'hr_uid'::uuid, 'hr')
on conflict (user_id, role) do nothing;

insert into public.profiles (id, full_name, name, is_approved) values
  (:'emp_uid'::uuid, 'CO Emp', 'CO Emp', true),
  (:'hr_uid'::uuid,  'CO HR',  'CO HR',  true)
on conflict (id) do update set is_approved = true;

insert into public.employees (id, user_id, name, email, is_active)
values (:'emp_id'::uuid, :'emp_uid'::uuid, 'CO Emp', 'co-emp@test.local', true)
on conflict (id) do nothing;

-- Pending compoff leave for a Sunday, with the linked pending credit
insert into public.compoff_ledger
  (id, employee_id, earned_date, earned_type, status, approval_status, expires_at, created_by)
values
  (:'ledger_id'::uuid, :'emp_id'::uuid, current_date - 7, 'weekend',
   'available', 'pending', current_date + 83, :'emp_uid'::uuid);

insert into public.leave_requests
  (id, employee_id, employee_name, leave_type, start_date, end_date, total_days, reason, status)
values
  (:'leave_id'::uuid, :'emp_id'::uuid, 'CO Emp', 'compoff',
   current_date + 1, current_date + 1, 1, 'take comp-off', 'submitted');

update public.compoff_ledger set leave_request_id = :'leave_id'::uuid where id = :'ledger_id'::uuid;

create or replace function pg_temp.as_user(_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end$$;

-- (1) HR inbox hides the linked-pending credit
select pg_temp.as_user(:'hr_uid'::uuid);
select is(
  (select count(*)::int from public.list_pending_compoff_credits(null,null,null,'all','submitted','desc',1,50)
     where employee_id = :'emp_id'::uuid),
  0,
  'linked pending credit is hidden from HR credit inbox');
reset role;

-- (2) Approve path: settle → credit approved + redeemed
select pg_temp.as_user(:'hr_uid'::uuid);
select lives_ok(
  $$ select public.settle_compoff_leave_decision(:'leave_id'::uuid, true, 'ok') $$,
  'HR can settle approval (RPC is sole writer)');
reset role;

select is(
  (select status from public.leave_requests where id = :'leave_id'::uuid),
  'approved',
  'leave_requests.status = approved after RPC (no client-side update)');
select is(
  (select approver_id from public.leave_requests where id = :'leave_id'::uuid),
  :'hr_uid'::uuid,
  'leave_requests.approver_id set to HR by RPC');

select is(
  (select approval_status from public.compoff_ledger where id = :'ledger_id'::uuid),
  'approved',
  'ledger approval_status = approved after leave approval');
select is(
  (select status from public.compoff_ledger where id = :'ledger_id'::uuid),
  'redeemed',
  'ledger status = redeemed after leave approval');
select is(
  (select redeemed_on from public.compoff_ledger where id = :'ledger_id'::uuid),
  current_date,
  'ledger redeemed_on = today');

-- (3) Reject path: reset then reject
update public.compoff_ledger
   set approval_status='pending', status='available', redeemed_on=null,
       leave_request_id=:'leave_id'::uuid, approved_by=null, approved_by_name=null, approved_at=null
 where id = :'ledger_id'::uuid;
update public.leave_requests set status='submitted', approver_id=null, approver_name=null, approved_rejected_at=null, comments=null where id = :'leave_id'::uuid;

select pg_temp.as_user(:'hr_uid'::uuid);
select lives_ok(
  $$ select public.settle_compoff_leave_decision(:'leave_id'::uuid, false, 'nope') $$,
  'HR can settle rejection (RPC is sole writer)');
reset role;

select is(
  (select status from public.leave_requests where id = :'leave_id'::uuid),
  'rejected',
  'leave_requests.status = rejected after RPC rejection');

select is(
  (select leave_request_id from public.compoff_ledger where id = :'ledger_id'::uuid),
  NULL::uuid,
  'ledger leave_request_id cleared on rejection');
select is(
  (select approval_status from public.compoff_ledger where id = :'ledger_id'::uuid),
  'pending',
  'ledger stays pending on rejection');

select pg_temp.as_user(:'hr_uid'::uuid);
select is(
  (select count(*)::int from public.list_pending_compoff_credits(null,null,null,'all','submitted','desc',1,50)
     where id = :'ledger_id'::uuid),
  1,
  'unlinked pending credit re-appears in HR inbox');
reset role;

-- (4) Compoff leave with NO linked ledger still settles the leave row.
\set solo_leave_id 'eee88882-eeee-eeee-eeee-eeeeeeeeeeee'
insert into public.leave_requests
  (id, employee_id, employee_name, leave_type, start_date, end_date, total_days, reason, status)
values
  (:'solo_leave_id'::uuid, :'emp_id'::uuid, 'CO Emp', 'compoff',
   current_date + 2, current_date + 2, 1, 'compoff no ledger', 'submitted');

select pg_temp.as_user(:'hr_uid'::uuid);
select lives_ok(
  $$ select public.settle_compoff_leave_decision(:'solo_leave_id'::uuid, true, 'no-ledger ok') $$,
  'RPC settles compoff leave that has no linked ledger');
reset role;

select is(
  (select status from public.leave_requests where id = :'solo_leave_id'::uuid),
  'approved',
  'unlinked compoff leave row is still marked approved');

select * from finish();
rollback;
