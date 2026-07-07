CREATE OR REPLACE FUNCTION public.get_next_birthday()
RETURNS TABLE (
  employee_id uuid,
  name text,
  department text,
  birth_month int,
  birth_day int,
  days_until int,
  is_today boolean,
  is_owner boolean,
  is_flashed boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date;
  v_has_staff boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF NOT public.is_user_approved(v_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.role <> 'b2b_customer'::app_role
  ) INTO v_has_staff;

  IF NOT v_has_staff THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      e.id AS employee_id,
      e.name AS name,
      e.department AS department,
      EXTRACT(MONTH FROM e.date_of_birth)::int AS bm,
      EXTRACT(DAY   FROM e.date_of_birth)::int AS bd,
      e.user_id AS emp_user_id,
      CASE
        WHEN make_date(
               EXTRACT(YEAR FROM v_today)::int,
               EXTRACT(MONTH FROM e.date_of_birth)::int,
               LEAST(
                 EXTRACT(DAY FROM e.date_of_birth)::int,
                 EXTRACT(DAY FROM (date_trunc('month',
                   make_date(EXTRACT(YEAR FROM v_today)::int,
                             EXTRACT(MONTH FROM e.date_of_birth)::int, 1))
                   + interval '1 month - 1 day'))::int
               )
             ) >= v_today
        THEN make_date(
               EXTRACT(YEAR FROM v_today)::int,
               EXTRACT(MONTH FROM e.date_of_birth)::int,
               LEAST(
                 EXTRACT(DAY FROM e.date_of_birth)::int,
                 EXTRACT(DAY FROM (date_trunc('month',
                   make_date(EXTRACT(YEAR FROM v_today)::int,
                             EXTRACT(MONTH FROM e.date_of_birth)::int, 1))
                   + interval '1 month - 1 day'))::int
               )
             )
        ELSE make_date(
               EXTRACT(YEAR FROM v_today)::int + 1,
               EXTRACT(MONTH FROM e.date_of_birth)::int,
               LEAST(
                 EXTRACT(DAY FROM e.date_of_birth)::int,
                 EXTRACT(DAY FROM (date_trunc('month',
                   make_date(EXTRACT(YEAR FROM v_today)::int + 1,
                             EXTRACT(MONTH FROM e.date_of_birth)::int, 1))
                   + interval '1 month - 1 day'))::int
               )
             )
      END AS next_occurrence
    FROM public.employees e
    WHERE e.is_active = true
      AND e.date_of_birth IS NOT NULL
  )
  SELECT
    c.employee_id, c.name, c.department, c.bm, c.bd,
    (c.next_occurrence - v_today)::int,
    (c.next_occurrence = v_today),
    (c.emp_user_id = v_uid),
    EXISTS (SELECT 1 FROM public.birthday_flashes bf
            WHERE bf.employee_id = c.employee_id AND bf.flash_date = v_today)
  FROM candidates c
  ORDER BY c.next_occurrence ASC, c.name ASC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_birthday() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_next_birthday() TO authenticated;