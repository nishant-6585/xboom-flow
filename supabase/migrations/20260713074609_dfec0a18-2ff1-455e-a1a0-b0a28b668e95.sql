-- Allow employees to claim their own comp-off credit via a validated SECURITY DEFINER RPC.
-- Direct client INSERTs remain restricted to HR/Admin (prevents self-granting arbitrary credits).

CREATE OR REPLACE FUNCTION public.claim_compoff_credit(
  p_earned_date DATE,
  p_earned_type TEXT,
  p_holiday_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_emp_id UUID;
  v_dow INT;
  v_holiday_name TEXT;
  v_existing UUID;
  v_worked BOOLEAN;
  v_ledger_id UUID;
  v_expires DATE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_emp_id
  FROM public.employees
  WHERE user_id = v_uid AND COALESCE(is_active, TRUE) = TRUE
  LIMIT 1;

  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION 'Employee record not found for current user' USING ERRCODE = '42501';
  END IF;

  IF p_earned_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Earned date cannot be in the future';
  END IF;

  IF p_earned_date < CURRENT_DATE - INTERVAL '90 days' THEN
    RAISE EXCEPTION 'Earned date is more than 90 days old and can no longer be claimed';
  END IF;

  IF p_earned_type NOT IN ('holiday','weekend') THEN
    RAISE EXCEPTION 'Invalid earned_type: %', p_earned_type;
  END IF;

  -- Validate the date matches the claimed type
  IF p_earned_type = 'weekend' THEN
    v_dow := EXTRACT(DOW FROM p_earned_date); -- 0=Sun, 6=Sat
    IF v_dow NOT IN (0, 6) THEN
      RAISE EXCEPTION 'Earned date % is not a weekend', p_earned_date;
    END IF;
  ELSE -- holiday
    SELECT name INTO v_holiday_name
    FROM public.holidays
    WHERE holiday_date = p_earned_date
      AND (p_holiday_id IS NULL OR id = p_holiday_id)
    LIMIT 1;
    IF v_holiday_name IS NULL THEN
      RAISE EXCEPTION 'No holiday found for date %', p_earned_date;
    END IF;
  END IF;

  -- Must have actually worked that day (attendance log with check-in)
  SELECT EXISTS (
    SELECT 1 FROM public.attendance_logs
    WHERE employee_id = v_emp_id
      AND date = p_earned_date
      AND check_in_time IS NOT NULL
  ) INTO v_worked;

  IF NOT v_worked THEN
    RAISE EXCEPTION 'No attendance record found for % — comp-off can only be claimed for days you worked', p_earned_date;
  END IF;

  -- Prevent duplicate claim for same date
  SELECT id INTO v_existing
  FROM public.compoff_ledger
  WHERE employee_id = v_emp_id AND earned_date = p_earned_date
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_expires := p_earned_date + INTERVAL '90 days';

  INSERT INTO public.compoff_ledger (
    employee_id, earned_date, earned_type, holiday_id, holiday_name,
    status, expires_at, created_by
  ) VALUES (
    v_emp_id, p_earned_date, p_earned_type, p_holiday_id, v_holiday_name,
    'available', v_expires, v_uid
  )
  RETURNING id INTO v_ledger_id;

  RETURN v_ledger_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_compoff_credit(DATE, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_compoff_credit(DATE, TEXT, UUID) TO authenticated;