
-- Birthday RPC: returns only name/department/avatar for today's birthdays (IST)
-- Never returns dob, birth year, or age. Blocks unapproved users and portal customers.

CREATE OR REPLACE FUNCTION public.get_todays_birthdays()
RETURNS TABLE (
  employee_id uuid,
  name text,
  department text,
  avatar_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date;
  v_month int;
  v_day int;
  v_is_leap boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_user_approved(v_uid) THEN
    RAISE EXCEPTION 'Not approved' USING ERRCODE = '42501';
  END IF;

  -- Explicitly block portal customer role
  IF public.has_role(v_uid, 'b2b_customer'::app_role) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_month := EXTRACT(MONTH FROM v_today)::int;
  v_day   := EXTRACT(DAY   FROM v_today)::int;

  -- Leap year check for current IST year
  v_is_leap := (
    EXTRACT(YEAR FROM v_today)::int % 4 = 0
    AND (EXTRACT(YEAR FROM v_today)::int % 100 <> 0
         OR EXTRACT(YEAR FROM v_today)::int % 400 = 0)
  );

  RETURN QUERY
  SELECT
    e.id AS employee_id,
    e.name,
    e.department,
    p.avatar_url
  FROM public.employees e
  LEFT JOIN public.profiles p ON p.user_id = e.user_id
  WHERE e.is_active = true
    AND e.date_of_birth IS NOT NULL
    AND (
      -- Regular match
      (EXTRACT(MONTH FROM e.date_of_birth)::int = v_month
       AND EXTRACT(DAY FROM e.date_of_birth)::int = v_day)
      OR
      -- Feb-29 birthdays celebrate on Feb-28 in non-leap years
      (NOT v_is_leap
       AND v_month = 2 AND v_day = 28
       AND EXTRACT(MONTH FROM e.date_of_birth)::int = 2
       AND EXTRACT(DAY FROM e.date_of_birth)::int = 29)
    )
  ORDER BY e.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_todays_birthdays() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_todays_birthdays() TO authenticated;

COMMENT ON FUNCTION public.get_todays_birthdays() IS
'Returns today''s birthday employees (IST) with name/department/avatar only. Never exposes DOB or age. Blocks unapproved users and b2b_customer role.';
