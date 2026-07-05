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

select plan(7);

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

select * from finish();

rollback;