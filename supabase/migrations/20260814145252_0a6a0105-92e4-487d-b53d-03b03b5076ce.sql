-- HR "Apply Leave for Employee" lacked a Comp-Off option because comp-off needs a
-- ledger credit and employees/HR cannot insert into compoff_ledger from the client.
-- This SECURITY DEFINER RPC lets Admin/HR raise an approved comp-off leave on an
-- employee's behalf: it validates the worked day, creates the credit already
-- approved (HR is the approver), and redeems it against the new leave request.
CREATE OR REPLACE FUNCTION public.hr_apply_compoff_leave(
  p_employee_id uuid,
  p_earned_date date,
  p_earned_type text,
  p_leave_date date,
  p_holiday_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_name text;
  v_dow int;
  v_holiday_name text;
  v_holiday_id uuid := p_holiday_id;
  v_worked boolean;
  v_existing record;
  v_ledger_id uuid;
  v_leave_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'hr')) THEN
    RAISE EXCEPTION 'Only Admin or HR can apply comp-off on behalf of an employee'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = p_employee_id AND COALESCE(is_active, TRUE) = TRUE
  ) THEN
    RAISE EXCEPTION 'Active employee record not found';
  END IF;

  IF p_earned_type NOT IN ('holiday','weekend') THEN
    RAISE EXCEPTION 'Invalid earned type: %', p_earned_type;
  END IF;

  IF p_earned_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Worked date cannot be in the future';
  END IF;

  IF p_earned_date < CURRENT_DATE - INTERVAL '90 days' THEN
    RAISE EXCEPTION 'Worked date is more than 90 days old and can no longer be claimed';
  END IF;

  IF p_earned_type = 'weekend' THEN
    v_dow := EXTRACT(DOW FROM p_earned_date);
    IF v_dow NOT IN (0, 6) THEN
      RAISE EXCEPTION 'Worked date % is not a weekend', p_earned_date;
    END IF;
  ELSE
    SELECT id, name INTO v_holiday_id, v_holiday_name
      FROM public.holidays
     WHERE holiday_date = p_earned_date
       AND (p_holiday_id IS NULL OR id = p_holiday_id)
     LIMIT 1;
    IF v_holiday_name IS NULL THEN
      RAISE EXCEPTION 'No holiday found for date %', p_earned_date;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.attendance_logs
    WHERE employee_id = p_employee_id
      AND date = p_earned_date
      AND check_in_time IS NOT NULL
  ) INTO v_worked;

  IF NOT v_worked THEN
    RAISE EXCEPTION 'No attendance record found for % — comp-off can only be granted for days the employee worked', p_earned_date;
  END IF;

  IF p_leave_date IS NULL THEN
    RAISE EXCEPTION 'Comp-off leave date is required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.leave_requests
    WHERE employee_id = p_employee_id
      AND status IN ('submitted','approved')
      AND start_date <= p_leave_date
      AND end_date >= p_leave_date
  ) THEN
    RAISE EXCEPTION 'The employee already has a leave request covering %', p_leave_date;
  END IF;

  SELECT id, status, leave_request_id INTO v_existing
    FROM public.compoff_ledger
   WHERE employee_id = p_employee_id AND earned_date = p_earned_date
   LIMIT 1;

  IF v_existing.id IS NOT NULL AND v_existing.status <> 'available' THEN
    RAISE EXCEPTION 'The comp-off credit for % is already % and cannot be reused',
      p_earned_date, v_existing.status;
  END IF;

  SELECT name INTO v_actor_name FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  INSERT INTO public.leave_requests (
    employee_id, leave_type, start_date, end_date, reason, status,
    approver_id, approver_name, approved_rejected_at,
    applied_by_id, applied_by_name, is_hr_applied, comments
  ) VALUES (
    p_employee_id, 'compoff', p_leave_date, p_leave_date, p_reason, 'approved',
    v_uid, v_actor_name, now(),
    v_uid, v_actor_name, TRUE,
    format('Comp-off applied by HR (%s) on behalf of employee for work on %s',
           COALESCE(v_actor_name, 'HR'), p_earned_date)
  )
  RETURNING id INTO v_leave_id;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.compoff_ledger
       SET status = 'redeemed',
           approval_status = 'approved',
           approved_by = v_uid,
           approved_by_name = v_actor_name,
           approved_at = now(),
           redeemed_on = p_leave_date,
           leave_request_id = v_leave_id,
           updated_at = now()
     WHERE id = v_existing.id
    RETURNING id INTO v_ledger_id;
  ELSE
    INSERT INTO public.compoff_ledger (
      employee_id, earned_date, earned_type, holiday_id, holiday_name,
      status, approval_status, approved_by, approved_by_name, approved_at,
      redeemed_on, leave_request_id, expires_at, created_by
    ) VALUES (
      p_employee_id, p_earned_date, p_earned_type, v_holiday_id, v_holiday_name,
      'redeemed', 'approved', v_uid, v_actor_name, now(),
      p_leave_date, v_leave_id, p_earned_date + INTERVAL '90 days', v_uid
    )
    RETURNING id INTO v_ledger_id;
  END IF;

  INSERT INTO public.compoff_audit_log (
    ledger_id, employee_id, action, actor_id, actor_name, earned_date, earned_type, comment
  ) VALUES (
    v_ledger_id, p_employee_id, 'approved', v_uid, v_actor_name,
    p_earned_date, p_earned_type,
    format('Comp-off granted by HR on behalf of employee and redeemed on %s', p_leave_date)
  );

  RETURN v_leave_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_apply_compoff_leave(uuid, date, text, date, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_apply_compoff_leave(uuid, date, text, date, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_apply_compoff_leave(uuid, date, text, date, uuid, text) TO authenticated;