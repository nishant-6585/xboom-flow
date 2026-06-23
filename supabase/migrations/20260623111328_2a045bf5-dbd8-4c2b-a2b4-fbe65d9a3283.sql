-- Allow 'compoff' leave_type and update overlap trigger to also consider 'submitted' requests
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_leave_type_check
  CHECK (leave_type = ANY (ARRAY[
    'casual','sick','paid','EL','unpaid','half_day',
    'half_day_casual','half_day_sick','half_day_paid','half_day_EL','half_day_unpaid',
    'wfh','compoff'
  ]));

CREATE OR REPLACE FUNCTION public.prevent_overlapping_leave_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conflict_id uuid;
  v_conflict_dates text;
  v_conflict_status text;
BEGIN
  IF NEW.status IN ('rejected', 'cancelled') THEN
    RETURN NEW;
  END IF;

  SELECT id, status, (start_date::text || ' to ' || end_date::text)
    INTO v_conflict_id, v_conflict_status, v_conflict_dates
  FROM public.leave_requests
  WHERE employee_id = NEW.employee_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status IN ('submitted', 'pending', 'approved')
    AND daterange(start_date, end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate leave: this employee already has a % leave request for overlapping dates (%). Please cancel the existing one before applying a new request.',
      v_conflict_status, v_conflict_dates
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$function$;