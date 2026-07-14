
-- Extend guard to allow the link RPC (which sets a local session flag) to update.
CREATE OR REPLACE FUNCTION public.compoff_ledger_guard_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'hr'::app_role) THEN
    RETURN NEW;
  END IF;
  -- Controlled bypass: link RPC sets this GUC (LOCAL) after ownership checks.
  IF current_setting('app.compoff_link_bypass', true) = '1' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Only Admin/HR can modify comp-off ledger rows'
    USING ERRCODE = '42501';
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_compoff_to_leave(p_ledger_id uuid, p_leave_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_emp uuid;
  v_ledger record;
  v_leave record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_emp FROM public.employees WHERE user_id = v_uid LIMIT 1;
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'Employee record not found' USING ERRCODE = '42501';
  END IF;

  SELECT id, employee_id, status, leave_request_id
    INTO v_ledger
    FROM public.compoff_ledger
   WHERE id = p_ledger_id;
  IF v_ledger.id IS NULL THEN
    RAISE EXCEPTION 'Comp-off credit not found';
  END IF;
  IF v_ledger.employee_id <> v_emp THEN
    RAISE EXCEPTION 'Not authorized to link this credit' USING ERRCODE = '42501';
  END IF;
  IF v_ledger.status <> 'available' THEN
    RAISE EXCEPTION 'Comp-off credit is not available (status: %)', v_ledger.status;
  END IF;
  IF v_ledger.leave_request_id IS NOT NULL THEN
    RAISE EXCEPTION 'Comp-off credit is already linked to another leave request';
  END IF;

  SELECT id, employee_id, status, leave_type
    INTO v_leave
    FROM public.leave_requests
   WHERE id = p_leave_id;
  IF v_leave.id IS NULL THEN
    RAISE EXCEPTION 'Leave request not found';
  END IF;
  IF v_leave.employee_id <> v_emp THEN
    RAISE EXCEPTION 'Not authorized to link to this leave request' USING ERRCODE = '42501';
  END IF;
  IF v_leave.leave_type <> 'compoff' THEN
    RAISE EXCEPTION 'Leave request is not a comp-off request';
  END IF;
  IF v_leave.status NOT IN ('submitted','pending') THEN
    RAISE EXCEPTION 'Leave request is not pending (status: %)', v_leave.status;
  END IF;

  PERFORM set_config('app.compoff_link_bypass', '1', true);
  UPDATE public.compoff_ledger
     SET leave_request_id = p_leave_id
   WHERE id = p_ledger_id;
  PERFORM set_config('app.compoff_link_bypass', '0', true);
END;
$$;

REVOKE ALL ON FUNCTION public.link_compoff_to_leave(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_compoff_to_leave(uuid, uuid) TO authenticated;

-- One-time repair: link stray unattached credits to the employee's most recent
-- submitted/pending compoff leave. Uses the bypass flag directly (migration
-- runs as owner but the guard still fires with auth.uid()=NULL).
DO $$ BEGIN
  PERFORM set_config('app.compoff_link_bypass', '1', true);
END $$;

WITH candidates AS (
  SELECT DISTINCT ON (cl.id)
    cl.id AS ledger_id,
    l.id  AS leave_id
  FROM public.compoff_ledger cl
  JOIN public.leave_requests l
    ON l.employee_id = cl.employee_id
   AND l.leave_type = 'compoff'
   AND l.status IN ('submitted','pending')
  WHERE cl.leave_request_id IS NULL
    AND cl.status = 'available'
  ORDER BY cl.id, l.created_at DESC
)
UPDATE public.compoff_ledger cl
   SET leave_request_id = c.leave_id
  FROM candidates c
 WHERE cl.id = c.ledger_id;
