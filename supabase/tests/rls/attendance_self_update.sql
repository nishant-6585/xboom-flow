-- pgTAP tests for the attendance_logs self-update guard, narrowed on
-- 2026-07-08 after employees were blocked from checking out. Verifies:
--   * a normal employee CAN check out (status + check_out_time change)
--   * a normal employee CAN start/end a break on their own row
--   * a normal employee CAN update auto_checkout_* fields (previous guard
--     froze these and prevented editing rows the cron had touched)
--   * a normal employee CANNOT self-approve (approved_by / _name)
--   * a normal employee CANNOT self-reconcile (reconciliation_status)
--   * a normal employee CANNOT stamp corrected_by / corrected_at
--
-- Run with: supabase test db

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

set local role postgres;

\set emp_uid      '88888888-8888-8888-8888-888888888888'
\set emp_id       '99999999-9999-9999-9999-999999999999'
\set att_id       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

insert into auth.users (id, email, instance_id, aud, role) values
  (:'emp_uid'::uuid, 'rls-att-emp@test.local',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  (:'emp_uid'::uuid, 'sales')
on conflict (user_id, role) do nothing;

insert into public.profiles (id, full_name, is_approved) values
  (:'emp_uid'::uuid, 'RLS Att Emp', true)
on conflict (id) do update set is_approved = true;

insert into public.employees
  (id, user_id, name, department, role, employment_status, is_active)
values
  (:'emp_id'::uuid, :'emp_uid'::uuid, 'RLS Att Emp',
   'sales', 'sales', 'active', true)
on conflict (id) do nothing;

insert into public.attendance_logs
  (id, employee_id, date, check_in_time, status, source)
values
  (:'att_id'::uuid, :'emp_id'::uuid, current_date,
   now() - interval '8 hours', 'present', 'xboom');

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

select pg_temp.as_user(:'emp_uid'::uuid);

-- Happy path: normal check-out flips status and stamps check_out_time.
select lives_ok(
  $$ update public.attendance_logs
       set check_out_time = now(),
           status = 'present'
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'employee CAN check out on own row'
);

-- Break start / end.
select lives_ok(
  $$ update public.attendance_logs
       set break_start_time = now(), break_end_time = null
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'employee CAN start break on own row'
);

select lives_ok(
  $$ update public.attendance_logs
       set break_end_time = now(), total_break_minutes = 15
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'employee CAN end break on own row'
);

-- Employee editing auto_checkout_* / provisional / source (not frozen).
select lives_ok(
  $$ update public.attendance_logs
       set is_provisional_checkout = false,
           auto_checkout_applied = false,
           auto_checkout_time = null,
           source = 'xboom'
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'employee CAN clear auto_checkout_* / source fields on own row'
);

-- Guard: cannot self-approve.
select throws_ok(
  $$ update public.attendance_logs set approved_by = '88888888-8888-8888-8888-888888888888'
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501', null,
  'employee CANNOT set approved_by on own row'
);

select throws_ok(
  $$ update public.attendance_logs set approved_by_name = 'self'
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501', null,
  'employee CANNOT set approved_by_name on own row'
);

-- Guard: cannot self-reconcile.
select throws_ok(
  $$ update public.attendance_logs set reconciliation_status = 'reconciled'
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501', null,
  'employee CANNOT set reconciliation_status on own row'
);

-- Guard: cannot stamp corrected_by.
select throws_ok(
  $$ update public.attendance_logs set corrected_by = '88888888-8888-8888-8888-888888888888',
                                       corrected_at = now()
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501', null,
  'employee CANNOT set corrected_by / corrected_at on own row'
);

select * from finish();

rollback;