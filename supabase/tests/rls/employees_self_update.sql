-- pgTAP tests for the employees self-update guard trigger
-- (trg_guard_employees_sensitive_updates) added 2026-07-05 after the
-- PRIVILEGE_ESCALATION finding on the "Users can update their own employee
-- record" policy.
--
-- Verifies:
--   * a non-HR employee CAN update their own bank_account / ifsc_code
--   * a non-HR employee CANNOT update monthly_salary or role
--   * an HR user CAN update monthly_salary and role
--   * bank_account changes write an employee_bank_audit_log row
--
-- Run with: supabase test db

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

set local role postgres;

\set sales_uid   '55555555-5555-5555-5555-555555555555'
\set hr_uid      '66666666-6666-6666-6666-666666666666'
\set sales_emp   '77777777-7777-7777-7777-777777777777'

insert into auth.users (id, email, instance_id, aud, role)
values
  (:'sales_uid'::uuid, 'rls-emp-sales@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:'hr_uid'::uuid,    'rls-emp-hr@test.local',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  (:'sales_uid'::uuid, 'sales'),
  (:'hr_uid'::uuid,    'hr')
on conflict (user_id, role) do nothing;

insert into public.profiles (id, full_name, is_approved)
values
  (:'sales_uid'::uuid, 'RLS Emp Sales', true),
  (:'hr_uid'::uuid,    'RLS Emp HR',    true)
on conflict (id) do update set is_approved = true;

insert into public.employees
  (id, user_id, name, department, role, employment_status,
   monthly_salary, bank_account, ifsc_code)
values
  (:'sales_emp'::uuid, :'sales_uid'::uuid, 'RLS Sales Emp',
   'sales', 'sales', 'active', 50000, 'OLDACCT001', 'OLDIFSC0001')
on conflict (id) do nothing;

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

-- ---------------------------------------------------------------------------
-- Sales employee editing their own record
-- ---------------------------------------------------------------------------
select pg_temp.as_user(:'sales_uid'::uuid);

select lives_ok(
  $$ update public.employees set bank_account = 'NEWACCT999'
     where id = '77777777-7777-7777-7777-777777777777' $$,
  'sales employee CAN update own bank_account'
);

select lives_ok(
  $$ update public.employees set ifsc_code = 'NEWIFSC9999'
     where id = '77777777-7777-7777-7777-777777777777' $$,
  'sales employee CAN update own ifsc_code'
);

select throws_ok(
  $$ update public.employees set monthly_salary = 999999
     where id = '77777777-7777-7777-7777-777777777777' $$,
  '42501',
  null,
  'sales employee CANNOT update own monthly_salary'
);

select throws_ok(
  $$ update public.employees set role = 'admin'
     where id = '77777777-7777-7777-7777-777777777777' $$,
  '42501',
  null,
  'sales employee CANNOT update own role'
);

-- Audit rows exist for the two successful bank/ifsc updates.
select is(
  (select count(*)::int from public.employee_bank_audit_log
     where employee_id = '77777777-7777-7777-7777-777777777777'),
  2,
  'bank_account + ifsc_code updates each wrote an audit row'
);

-- Exactly ONE HR notification per bank change (not one per column).
-- Two prior updates (bank_account, then ifsc_code) → 2 notifications.
select is(
  (select count(*)::int from public.notifications
     where type = 'employee_bank_change'
       and message like '%77777777-7777-7777-7777-777777777777%'),
  2,
  'each single-column bank update produced exactly one HR notification'
);

-- Combined update touching BOTH bank_account and ifsc_code in one statement
-- must still emit exactly ONE notification (not two).
select lives_ok(
  $$ update public.employees
       set bank_account = 'COMBOACCT', ifsc_code = 'COMBOIFSC'
     where id = '77777777-7777-7777-7777-777777777777' $$,
  'sales employee CAN update bank_account + ifsc_code together'
);

select is(
  (select count(*)::int from public.notifications
     where type = 'employee_bank_change'
       and message like '%77777777-7777-7777-7777-777777777777%'),
  3,
  'combined bank_account+ifsc_code update emitted exactly ONE additional notification'
);

-- Audit rows: combined update wrote one row per changed column (2 more → 4 total).
select is(
  (select count(*)::int from public.employee_bank_audit_log
     where employee_id = '77777777-7777-7777-7777-777777777777'),
  4,
  'combined update wrote one audit row per changed column'
);

-- Non-HR: joining_date / exit_date must be blocked (payroll-relevant dates).
select throws_ok(
  $$ update public.employees set joining_date = '2020-01-01'
     where id = '77777777-7777-7777-7777-777777777777' $$,
  '42501',
  null,
  'sales employee CANNOT update joining_date'
);

select throws_ok(
  $$ update public.employees set exit_date = '2030-01-01'
     where id = '77777777-7777-7777-7777-777777777777' $$,
  '42501',
  null,
  'sales employee CANNOT update exit_date'
);

-- ---------------------------------------------------------------------------
-- HR user editing another employee's record
-- ---------------------------------------------------------------------------
select pg_temp.as_user(:'hr_uid'::uuid);

select lives_ok(
  $$ update public.employees set monthly_salary = 60000
     where id = '77777777-7777-7777-7777-777777777777' $$,
  'HR CAN update monthly_salary'
);

select lives_ok(
  $$ update public.employees set role = 'sales_manager'
     where id = '77777777-7777-7777-7777-777777777777' $$,
  'HR CAN update role'
);

select lives_ok(
  $$ update public.employees set joining_date = '2024-06-01', exit_date = null
     where id = '77777777-7777-7777-7777-777777777777' $$,
  'HR CAN update joining_date / exit_date'
);

-- ---------------------------------------------------------------------------
-- Service-role / internal calls (auth.uid() IS NULL) must NOT be blocked
-- by the guard trigger. This is the explicit bypass branch that keeps
-- migrations, edge functions using service_role, and internal SECURITY DEFINER
-- functions working. Clearing request.jwt.claims makes auth.uid() return null.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
reset role;

select lives_ok(
  $$ update public.employees
       set monthly_salary = 75000, role = 'admin',
           joining_date = '2019-01-01'
     where id = '77777777-7777-7777-7777-777777777777' $$,
  'internal / service_role call (auth.uid() IS NULL) bypasses the guard'
);

select is(
  (select monthly_salary::int from public.employees
     where id = '77777777-7777-7777-7777-777777777777'),
  75000,
  'internal update to monthly_salary took effect'
);

select * from finish();

rollback;