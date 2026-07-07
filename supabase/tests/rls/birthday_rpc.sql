-- Tests for public.get_todays_birthdays()
-- Run manually against a dev branch. Verifies:
--   1. Return shape excludes dob/age fields.
--   2. Non-HR internal staff can call it.
--   3. IST boundary: a birthday matching today in IST is returned even if UTC is still yesterday.
--   4. Feb-29 birthdays celebrate on Feb-28 in non-leap years.
--   5. Zero-row case (called on a day with no birthdays) returns no rows (card hides).

-- 1. Shape: only employee_id / name / department / avatar_url. No dob, no age.
SELECT column_name
FROM information_schema.parameters
WHERE specific_schema = 'public'
  AND specific_name LIKE 'get_todays_birthdays%'
  AND parameter_mode = 'TABLE';
-- Expect exactly: employee_id, name, department, avatar_url

-- 2. Non-HR staff can execute (any authenticated + approved user).
--    Simulate a sales-role user:
-- SET LOCAL role authenticated;
-- SET LOCAL "request.jwt.claims" = '{"sub":"<sales-user-uuid>"}';
-- SELECT * FROM public.get_todays_birthdays();  -- should not raise

-- 3. IST boundary check — at 23:30 UTC on Jul 6, IST is already Jul 7 05:00.
--    A DOB of 1990-07-07 should appear even though UTC date is still 2026-07-06.
--    Verify with:
SELECT
  (now() AT TIME ZONE 'Asia/Kolkata')::date AS ist_today,
  (now() AT TIME ZONE 'UTC')::date          AS utc_today;

-- 4. Feb-29 handling. In a non-leap year, a Feb-29 employee should surface on Feb 28.
--    Manual scenario (do in a transaction and roll back):
-- BEGIN;
--   INSERT INTO public.employees (id, user_id, name, department, is_active, date_of_birth)
--   VALUES (gen_random_uuid(), gen_random_uuid(), 'Leap Test', 'QA', true, '1992-02-29');
--   -- Simulate today = Feb 28, 2026 (non-leap): expect Leap Test to appear.
--   -- (Requires temporarily overriding now() or waiting for the date.)
-- ROLLBACK;

-- 5. Zero birthdays today → no rows.
SELECT COUNT(*) AS todays_birthday_count FROM public.get_todays_birthdays();

-- 6. Portal customer role is blocked.
-- SET LOCAL "request.jwt.claims" = '{"sub":"<b2b-customer-uuid>"}';
-- SELECT * FROM public.get_todays_birthdays();  -- should RAISE 'Forbidden'