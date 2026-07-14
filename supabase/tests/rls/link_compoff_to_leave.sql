-- Verifies employee-scoped comp-off credit linking via link_compoff_to_leave.
BEGIN;
SELECT plan(4);

-- Set up two employees with auth users
DO $$
DECLARE
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  e1 uuid;
  e2 uuid;
  led1 uuid;
  led2 uuid;
  lv1 uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u1, 'link_emp1@test.local'), (u2, 'link_emp2@test.local');
  INSERT INTO public.employees (user_id, name, email, employee_code, joining_date)
    VALUES (u1, 'Emp One', 'link_emp1@test.local', 'LT001', now()::date) RETURNING id INTO e1;
  INSERT INTO public.employees (user_id, name, email, employee_code, joining_date)
    VALUES (u2, 'Emp Two', 'link_emp2@test.local', 'LT002', now()::date) RETURNING id INTO e2;

  INSERT INTO public.compoff_ledger (employee_id, earned_date, earned_type, status, approval_status, expires_at)
    VALUES (e1, (now() - interval '2 days')::date, 'weekend', 'available', 'approved', (now() + interval '90 days')::date)
    RETURNING id INTO led1;
  INSERT INTO public.compoff_ledger (employee_id, earned_date, earned_type, status, approval_status, expires_at)
    VALUES (e2, (now() - interval '2 days')::date, 'weekend', 'available', 'approved', (now() + interval '90 days')::date)
    RETURNING id INTO led2;

  INSERT INTO public.leave_requests (employee_id, leave_type, start_date, end_date, status, reason)
    VALUES (e1, 'compoff', now()::date, now()::date, 'submitted', 'test')
    RETURNING id INTO lv1;

  PERFORM set_config('test.u1', u1::text, false);
  PERFORM set_config('test.u2', u2::text, false);
  PERFORM set_config('test.led1', led1::text, false);
  PERFORM set_config('test.led2', led2::text, false);
  PERFORM set_config('test.lv1',  lv1::text,  false);
END $$;

-- Impersonate employee 1
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.u1'), true);

-- (1) RPC links the credit
SELECT lives_ok(
  $$ SELECT public.link_compoff_to_leave(current_setting('test.led1')::uuid, current_setting('test.lv1')::uuid) $$,
  'employee can link own credit to own pending compoff leave'
);

-- (2) leave_request_id is set
SELECT is(
  (SELECT leave_request_id FROM public.compoff_ledger WHERE id = current_setting('test.led1')::uuid),
  current_setting('test.lv1')::uuid,
  'ledger.leave_request_id points to the leave request'
);

-- (3) Direct UPDATE still blocked by guard for employees
SELECT throws_ok(
  $$ UPDATE public.compoff_ledger SET leave_request_id = NULL WHERE id = current_setting('test.led1')::uuid $$,
  '42501',
  NULL,
  'direct compoff_ledger UPDATE by employee still blocked'
);

-- (4) Linking someone else's ledger is forbidden
SELECT throws_ok(
  $$ SELECT public.link_compoff_to_leave(current_setting('test.led2')::uuid, current_setting('test.lv1')::uuid) $$,
  '42501',
  NULL,
  'cannot link another employee''s credit'
);

SELECT * FROM finish();
ROLLBACK;