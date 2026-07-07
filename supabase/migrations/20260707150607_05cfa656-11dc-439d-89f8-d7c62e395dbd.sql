-- Remove old (broken) birthday RPCs
DROP FUNCTION IF EXISTS public.get_current_month_birthdays();
DROP FUNCTION IF EXISTS public.get_todays_birthdays();

-- Flash table: birthday employee opts in to share their wish with the team
CREATE TABLE IF NOT EXISTS public.birthday_flashes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  flash_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, flash_date)
);

GRANT SELECT ON public.birthday_flashes TO authenticated;
GRANT ALL ON public.birthday_flashes TO service_role;

ALTER TABLE public.birthday_flashes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved staff can read flashes"
  ON public.birthday_flashes FOR SELECT
  TO authenticated
  USING (
    public.is_user_approved(auth.uid())
    AND NOT public.has_role(auth.uid(), 'b2b_customer'::app_role)
  );

-- Next upcoming birthday (single row). Never returns dob / year / age.
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

  v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      e.id                                       AS employee_id,
      e.name                                     AS name,
      e.department                               AS department,
      EXTRACT(MONTH FROM e.date_of_birth)::int   AS bm,
      EXTRACT(DAY   FROM e.date_of_birth)::int   AS bd,
      e.user_id                                  AS emp_user_id,
      -- Next occurrence of this birthday on/after today (handles Feb 29 -> Feb 28 in non-leap)
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
    c.employee_id,
    c.name,
    c.department,
    c.bm,
    c.bd,
    (c.next_occurrence - v_today)::int AS days_until,
    (c.next_occurrence = v_today)      AS is_today,
    (c.emp_user_id = v_uid)            AS is_owner,
    EXISTS (
      SELECT 1 FROM public.birthday_flashes bf
      WHERE bf.employee_id = c.employee_id
        AND bf.flash_date  = v_today
    ) AS is_flashed
  FROM candidates c
  ORDER BY c.next_occurrence ASC, c.name ASC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_birthday() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_next_birthday() TO authenticated;

-- Flash my birthday: only the birthday employee, only on their birthday (IST).
CREATE OR REPLACE FUNCTION public.flash_my_birthday()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date;
  v_emp_id uuid;
  v_bm int;
  v_bd int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF NOT public.is_user_approved(v_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT e.id,
         EXTRACT(MONTH FROM e.date_of_birth)::int,
         EXTRACT(DAY   FROM e.date_of_birth)::int
    INTO v_emp_id, v_bm, v_bd
  FROM public.employees e
  WHERE e.user_id = v_uid AND e.is_active = true AND e.date_of_birth IS NOT NULL
  LIMIT 1;

  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION 'No active employee record';
  END IF;

  IF v_bm <> EXTRACT(MONTH FROM v_today)::int
     OR v_bd <> EXTRACT(DAY FROM v_today)::int THEN
    RAISE EXCEPTION 'Not your birthday today';
  END IF;

  INSERT INTO public.birthday_flashes (employee_id, flash_date)
  VALUES (v_emp_id, v_today)
  ON CONFLICT (employee_id, flash_date) DO NOTHING;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.flash_my_birthday() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.flash_my_birthday() TO authenticated;