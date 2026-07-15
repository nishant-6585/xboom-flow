-- Fix compoff leave settlement: fall back to employees.name when profiles row missing
CREATE OR REPLACE FUNCTION public.settle_compoff_leave_decision(p_leave_id uuid, p_approve boolean, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_name text;
  v_ledger record;
  v_emp_user_id uuid;
  v_leave_prev_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (has_role(v_uid,'admin'::app_role) OR has_role(v_uid,'hr'::app_role)) THEN
    RAISE EXCEPTION 'Only HR or Admin can settle comp-off leave decisions' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_actor_name FROM public.profiles WHERE id = v_uid;
  IF v_actor_name IS NULL OR btrim(v_actor_name) = '' THEN
    SELECT name INTO v_actor_name FROM public.employees WHERE user_id = v_uid LIMIT 1;
  END IF;
  IF v_actor_name IS NULL OR btrim(v_actor_name) = '' THEN
    v_actor_name := 'HR';
  END IF;

  SELECT status INTO v_leave_prev_status
    FROM public.leave_requests
   WHERE id = p_leave_id
   FOR UPDATE;

  IF v_leave_prev_status IS NULL THEN
    RAISE EXCEPTION 'Leave request % not found', p_leave_id USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.leave_requests
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         approver_id = v_uid,
         approver_name = v_actor_name,
         approved_rejected_at = now(),
         comments = p_comment
   WHERE id = p_leave_id;

  SELECT id, employee_id, earned_date, earned_type, approval_status, status
    INTO v_ledger
  FROM public.compoff_ledger
  WHERE leave_request_id = p_leave_id
  LIMIT 1;

  IF v_ledger.id IS NULL THEN
    RETURN jsonb_build_object('linked', false, 'leave_status',
      CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
  END IF;

  SELECT user_id INTO v_emp_user_id FROM public.employees WHERE id = v_ledger.employee_id;

  IF p_approve THEN
    IF v_ledger.approval_status = 'pending' THEN
      UPDATE public.compoff_ledger
         SET approval_status = 'approved',
             approved_by = v_uid,
             approved_by_name = v_actor_name,
             approved_at = now(),
             approval_comment = COALESCE(p_comment,'Approved with leave request'),
             rejection_reason = NULL,
             status = 'redeemed',
             redeemed_on = CURRENT_DATE
       WHERE id = v_ledger.id;

      INSERT INTO public.compoff_audit_log (
        ledger_id, employee_id, action, actor_id, actor_name,
        comment, earned_date, earned_type
      ) VALUES (
        v_ledger.id, v_ledger.employee_id, 'approved', v_uid, v_actor_name,
        COALESCE(p_comment,'Approved with leave request'),
        v_ledger.earned_date, v_ledger.earned_type
      );
    ELSE
      UPDATE public.compoff_ledger
         SET status = 'redeemed', redeemed_on = CURRENT_DATE
       WHERE id = v_ledger.id;
    END IF;

    RETURN jsonb_build_object('linked', true, 'action', 'approved_and_redeemed', 'ledger_id', v_ledger.id);
  ELSE
    UPDATE public.compoff_ledger
       SET leave_request_id = NULL,
           status = 'available',
           redeemed_on = NULL,
           approval_status = CASE WHEN approval_status = 'approved' THEN 'pending' ELSE approval_status END,
           approved_by = CASE WHEN approval_status = 'approved' THEN NULL ELSE approved_by END,
           approved_by_name = CASE WHEN approval_status = 'approved' THEN NULL ELSE approved_by_name END,
           approved_at = CASE WHEN approval_status = 'approved' THEN NULL ELSE approved_at END
     WHERE id = v_ledger.id;

    INSERT INTO public.compoff_audit_log (
      ledger_id, employee_id, action, actor_id, actor_name,
      comment, earned_date, earned_type
    ) VALUES (
      v_ledger.id, v_ledger.employee_id, 'leave_unlinked', v_uid, v_actor_name,
      COALESCE(p_comment,'Leave rejected — credit returned to inbox for standalone decision'),
      v_ledger.earned_date, v_ledger.earned_type
    );

    IF v_emp_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message)
      VALUES (
        v_emp_user_id,
        'compoff_leave_rejected',
        'Comp-off leave rejected — credit awaiting HR decision',
        'Your comp-off leave for ' || to_char(v_ledger.earned_date, 'Mon DD, YYYY')
          || ' was rejected. The earned comp-off credit is now with HR for a standalone decision.'
      );
    END IF;

    RETURN jsonb_build_object('linked', true, 'action', 'unlinked_pending', 'ledger_id', v_ledger.id);
  END IF;
END; $function$;

-- Backfill approver_name for existing leave_requests where it's missing but approver_id is present
UPDATE public.leave_requests lr
SET approver_name = COALESCE(
  (SELECT p.name FROM public.profiles p WHERE p.id = lr.approver_id),
  (SELECT e.name FROM public.employees e WHERE e.user_id = lr.approver_id LIMIT 1)
)
WHERE lr.approver_id IS NOT NULL
  AND (lr.approver_name IS NULL OR btrim(lr.approver_name) = '');