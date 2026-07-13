
-- 1. Add approval columns to compoff_ledger
ALTER TABLE public.compoff_ledger
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_by_name text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS approval_comment text;

-- Drop old default and enforce check constraint
ALTER TABLE public.compoff_ledger
  ALTER COLUMN approval_status SET DEFAULT 'pending';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'compoff_ledger_approval_status_check'
  ) THEN
    ALTER TABLE public.compoff_ledger
      ADD CONSTRAINT compoff_ledger_approval_status_check
      CHECK (approval_status IN ('pending','approved','rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_compoff_ledger_approval_status
  ON public.compoff_ledger (approval_status);

-- 2. Audit log table
CREATE TABLE IF NOT EXISTS public.compoff_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid NOT NULL REFERENCES public.compoff_ledger(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('submitted','approved','rejected')),
  actor_id uuid,
  actor_name text,
  reason text,
  comment text,
  earned_date date,
  earned_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.compoff_audit_log TO authenticated;
GRANT ALL ON public.compoff_audit_log TO service_role;

ALTER TABLE public.compoff_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin/HR read compoff audit" ON public.compoff_audit_log;
CREATE POLICY "Admin/HR read compoff audit"
  ON public.compoff_audit_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr'::app_role));

DROP POLICY IF EXISTS "Employees read own compoff audit" ON public.compoff_audit_log;
CREATE POLICY "Employees read own compoff audit"
  ON public.compoff_audit_log FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_compoff_audit_ledger ON public.compoff_audit_log (ledger_id);
CREATE INDEX IF NOT EXISTS idx_compoff_audit_employee ON public.compoff_audit_log (employee_id, created_at DESC);

-- 3. Update claim RPC: create as pending, write audit entry
CREATE OR REPLACE FUNCTION public.claim_compoff_credit(
  p_earned_date date,
  p_earned_type text,
  p_holiday_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF p_earned_type = 'weekend' THEN
    v_dow := EXTRACT(DOW FROM p_earned_date);
    IF v_dow NOT IN (0, 6) THEN
      RAISE EXCEPTION 'Earned date % is not a weekend', p_earned_date;
    END IF;
  ELSE
    SELECT name INTO v_holiday_name
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
    WHERE employee_id = v_emp_id
      AND date = p_earned_date
      AND check_in_time IS NOT NULL
  ) INTO v_worked;

  IF NOT v_worked THEN
    RAISE EXCEPTION 'No attendance record found for % — comp-off can only be claimed for days you worked', p_earned_date;
  END IF;

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
    status, approval_status, expires_at, created_by
  ) VALUES (
    v_emp_id, p_earned_date, p_earned_type, p_holiday_id, v_holiday_name,
    'available', 'pending', v_expires, v_uid
  )
  RETURNING id INTO v_ledger_id;

  INSERT INTO public.compoff_audit_log (
    ledger_id, employee_id, action, actor_id,
    actor_name, earned_date, earned_type
  )
  SELECT v_ledger_id, v_emp_id, 'submitted', v_uid,
         (SELECT name FROM public.employees WHERE id = v_emp_id),
         p_earned_date, p_earned_type;

  RETURN v_ledger_id;
END;
$function$;

-- 4. HR/Admin approve action
CREATE OR REPLACE FUNCTION public.approve_compoff_credit(
  p_ledger_id uuid,
  p_comment text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_name text;
  v_emp_id uuid;
  v_earned_date date;
  v_earned_type text;
  v_current_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (has_role(v_uid,'admin'::app_role) OR has_role(v_uid,'hr'::app_role)) THEN
    RAISE EXCEPTION 'Only HR or Admin can approve comp-off credits' USING ERRCODE = '42501';
  END IF;

  SELECT employee_id, earned_date, earned_type, approval_status
    INTO v_emp_id, v_earned_date, v_earned_type, v_current_status
  FROM public.compoff_ledger WHERE id = p_ledger_id;

  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION 'Comp-off credit not found';
  END IF;

  IF v_current_status = 'approved' THEN
    RETURN TRUE;
  END IF;

  IF v_current_status = 'rejected' THEN
    RAISE EXCEPTION 'This credit was already rejected';
  END IF;

  SELECT name INTO v_actor_name FROM public.profiles WHERE id = v_uid;

  UPDATE public.compoff_ledger
     SET approval_status = 'approved',
         approved_by = v_uid,
         approved_by_name = v_actor_name,
         approved_at = now(),
         approval_comment = p_comment,
         rejection_reason = NULL
   WHERE id = p_ledger_id;

  INSERT INTO public.compoff_audit_log (
    ledger_id, employee_id, action, actor_id, actor_name,
    comment, earned_date, earned_type
  ) VALUES (
    p_ledger_id, v_emp_id, 'approved', v_uid, v_actor_name,
    p_comment, v_earned_date, v_earned_type
  );

  RETURN TRUE;
END;
$$;

-- 5. HR/Admin reject action
CREATE OR REPLACE FUNCTION public.reject_compoff_credit(
  p_ledger_id uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_name text;
  v_emp_id uuid;
  v_earned_date date;
  v_earned_type text;
  v_current_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (has_role(v_uid,'admin'::app_role) OR has_role(v_uid,'hr'::app_role)) THEN
    RAISE EXCEPTION 'Only HR or Admin can reject comp-off credits' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  SELECT employee_id, earned_date, earned_type, approval_status
    INTO v_emp_id, v_earned_date, v_earned_type, v_current_status
  FROM public.compoff_ledger WHERE id = p_ledger_id;

  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION 'Comp-off credit not found';
  END IF;

  IF v_current_status = 'rejected' THEN
    RETURN TRUE;
  END IF;

  IF v_current_status = 'approved' THEN
    RAISE EXCEPTION 'This credit is already approved — cannot reject';
  END IF;

  SELECT name INTO v_actor_name FROM public.profiles WHERE id = v_uid;

  UPDATE public.compoff_ledger
     SET approval_status = 'rejected',
         approved_by = v_uid,
         approved_by_name = v_actor_name,
         approved_at = now(),
         rejection_reason = p_reason
   WHERE id = p_ledger_id;

  INSERT INTO public.compoff_audit_log (
    ledger_id, employee_id, action, actor_id, actor_name,
    reason, earned_date, earned_type
  ) VALUES (
    p_ledger_id, v_emp_id, 'rejected', v_uid, v_actor_name,
    p_reason, v_earned_date, v_earned_type
  );

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_compoff_credit(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_compoff_credit(uuid, text) TO authenticated;
