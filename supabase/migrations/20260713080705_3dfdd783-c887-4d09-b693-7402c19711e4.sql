
-- 1. Extend approve_compoff_credit to insert in-app notification for employee
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
  v_emp_user_id uuid;
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
  SELECT user_id INTO v_emp_user_id FROM public.employees WHERE id = v_emp_id;

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

  -- In-app notification for employee (if linked to auth user)
  IF v_emp_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message)
    VALUES (
      v_emp_user_id,
      'compoff_approved',
      'Comp-off credit approved',
      'Your comp-off credit for ' || to_char(v_earned_date, 'Mon DD, YYYY')
        || ' has been approved by ' || COALESCE(v_actor_name,'HR')
        || COALESCE(E'.\nComment: ' || NULLIF(btrim(p_comment),''), '.')
    );
  END IF;

  RETURN TRUE;
END;
$$;

-- 2. Extend reject_compoff_credit similarly
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
  v_emp_user_id uuid;
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
  SELECT user_id INTO v_emp_user_id FROM public.employees WHERE id = v_emp_id;

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

  IF v_emp_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message)
    VALUES (
      v_emp_user_id,
      'compoff_rejected',
      'Comp-off credit rejected',
      'Your comp-off credit for ' || to_char(v_earned_date, 'Mon DD, YYYY')
        || ' was rejected by ' || COALESCE(v_actor_name,'HR')
        || E'.\nReason: ' || p_reason
    );
  END IF;

  RETURN TRUE;
END;
$$;

-- 3. Bulk approve
CREATE OR REPLACE FUNCTION public.approve_compoff_credits_bulk(
  p_ledger_ids uuid[],
  p_comment text DEFAULT NULL
)
RETURNS TABLE(ledger_id uuid, ok boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr'::app_role)) THEN
    RAISE EXCEPTION 'Only HR or Admin can approve comp-off credits' USING ERRCODE = '42501';
  END IF;

  FOREACH v_id IN ARRAY COALESCE(p_ledger_ids, ARRAY[]::uuid[]) LOOP
    BEGIN
      PERFORM public.approve_compoff_credit(v_id, p_comment);
      ledger_id := v_id; ok := true; error := NULL; RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      ledger_id := v_id; ok := false; error := SQLERRM; RETURN NEXT;
    END;
  END LOOP;
END;
$$;

-- 4. Bulk reject (shared reason required)
CREATE OR REPLACE FUNCTION public.reject_compoff_credits_bulk(
  p_ledger_ids uuid[],
  p_reason text
)
RETURNS TABLE(ledger_id uuid, ok boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr'::app_role)) THEN
    RAISE EXCEPTION 'Only HR or Admin can reject comp-off credits' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A shared rejection reason is required';
  END IF;

  FOREACH v_id IN ARRAY COALESCE(p_ledger_ids, ARRAY[]::uuid[]) LOOP
    BEGIN
      PERFORM public.reject_compoff_credit(v_id, p_reason);
      ledger_id := v_id; ok := true; error := NULL; RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      ledger_id := v_id; ok := false; error := SQLERRM; RETURN NEXT;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_compoff_credits_bulk(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_compoff_credits_bulk(uuid[], text) TO authenticated;
