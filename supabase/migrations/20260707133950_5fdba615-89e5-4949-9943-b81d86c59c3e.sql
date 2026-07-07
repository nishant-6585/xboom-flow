
CREATE OR REPLACE FUNCTION public.get_current_month_birthdays()
RETURNS TABLE (
  employee_id uuid,
  name text,
  department text,
  avatar_url text,
  birth_month int,
  birth_day int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_month int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT public.is_user_approved(v_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF public.has_role(v_uid, 'b2b_customer'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_month := EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int;

  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.department,
    e.avatar_url,
    EXTRACT(MONTH FROM e.date_of_birth)::int,
    EXTRACT(DAY   FROM e.date_of_birth)::int
  FROM public.employees e
  WHERE e.is_active = true
    AND e.date_of_birth IS NOT NULL
    AND EXTRACT(MONTH FROM e.date_of_birth)::int = v_month
  ORDER BY EXTRACT(DAY FROM e.date_of_birth)::int ASC, e.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_month_birthdays() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_month_birthdays() TO authenticated;
