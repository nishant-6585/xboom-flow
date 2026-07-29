
-- Helper: is target employee a Sales team member?
CREATE OR REPLACE FUNCTION public.compoff_employee_is_sales(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.employees e
      JOIN public.user_roles ur ON ur.user_id = e.user_id
     WHERE e.id = _employee_id
       AND ur.role IN ('sales'::app_role, 'sales_manager'::app_role)
  );
$$;
GRANT EXECUTE ON FUNCTION public.compoff_employee_is_sales(uuid) TO authenticated, service_role;

-- 1) Trigger: allow sales_manager on compoff_ledger rows for sales employees
CREATE OR REPLACE FUNCTION public.compoff_ledger_guard_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_target_emp uuid := COALESCE(NEW.employee_id, OLD.employee_id);
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'hr'::app_role) THEN
    RETURN NEW;
  END IF;
  IF has_role(auth.uid(), 'sales_manager'::app_role)
     AND public.compoff_employee_is_sales(v_target_emp) THEN
    RETURN NEW;
  END IF;
  IF current_setting('app.compoff_link_bypass', true) = '1' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Only Admin/HR (or Sales Manager for sales employees) can modify comp-off ledger rows'
    USING ERRCODE = '42501';
END;
$$;

-- 2) RLS on compoff_ledger — allow sales_manager to SELECT/UPDATE sales rows
DROP POLICY IF EXISTS "Admin/HR update compoff ledger" ON public.compoff_ledger;
CREATE POLICY "Admin/HR/SalesMgr update compoff ledger"
  ON public.compoff_ledger FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR (has_role(auth.uid(), 'sales_manager'::app_role)
        AND public.compoff_employee_is_sales(employee_id))
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR (has_role(auth.uid(), 'sales_manager'::app_role)
        AND public.compoff_employee_is_sales(employee_id))
  );

DROP POLICY IF EXISTS "Employees view own compoff ledger" ON public.compoff_ledger;
CREATE POLICY "Own/Admin/HR/SalesMgr view compoff ledger"
  ON public.compoff_ledger FOR SELECT
  USING (
    (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()))
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR (has_role(auth.uid(), 'sales_manager'::app_role)
        AND public.compoff_employee_is_sales(employee_id))
  );

-- 3) approve_compoff_credit / reject_compoff_credit — extend role gate
CREATE OR REPLACE FUNCTION public.approve_compoff_credit(p_ledger_id uuid, p_comment text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_name text;
  v_emp_id uuid;
  v_emp_user_id uuid;
  v_earned_date date;
  v_earned_type text;
  v_current_status text;
  v_is_sales_mgr boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT employee_id, earned_date, earned_type, approval_status
    INTO v_emp_id, v_earned_date, v_earned_type, v_current_status
  FROM public.compoff_ledger WHERE id = p_ledger_id;

  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION 'Comp-off credit not found';
  END IF;

  v_is_sales_mgr := has_role(v_uid,'sales_manager'::app_role)
                    AND public.compoff_employee_is_sales(v_emp_id);

  IF NOT (has_role(v_uid,'admin'::app_role) OR has_role(v_uid,'hr'::app_role) OR v_is_sales_mgr) THEN
    RAISE EXCEPTION 'Only HR, Admin or Sales Manager (for sales staff) can approve comp-off credits' USING ERRCODE = '42501';
  END IF;

  IF v_current_status = 'approved' THEN RETURN TRUE; END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.reject_compoff_credit(p_ledger_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_name text;
  v_emp_id uuid;
  v_emp_user_id uuid;
  v_earned_date date;
  v_earned_type text;
  v_current_status text;
  v_is_sales_mgr boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
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

  v_is_sales_mgr := has_role(v_uid,'sales_manager'::app_role)
                    AND public.compoff_employee_is_sales(v_emp_id);

  IF NOT (has_role(v_uid,'admin'::app_role) OR has_role(v_uid,'hr'::app_role) OR v_is_sales_mgr) THEN
    RAISE EXCEPTION 'Only HR, Admin or Sales Manager (for sales staff) can reject comp-off credits' USING ERRCODE = '42501';
  END IF;

  IF v_current_status = 'rejected' THEN RETURN TRUE; END IF;
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
$function$;

-- 4) list_pending_compoff_credits — allow sales_manager; scope to sales employees
CREATE OR REPLACE FUNCTION public.list_pending_compoff_credits(
  p_search text DEFAULT NULL::text,
  p_worked_from date DEFAULT NULL::date,
  p_worked_to date DEFAULT NULL::date,
  p_expiry_filter text DEFAULT 'all'::text,
  p_sort_by text DEFAULT 'submitted'::text,
  p_sort_dir text DEFAULT 'desc'::text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS TABLE(id uuid, employee_id uuid, employee_name text, earned_date date, earned_type text, holiday_name text, created_at timestamp with time zone, expires_at timestamp with time zone, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_offset integer := GREATEST((COALESCE(p_page,1)-1) * COALESCE(p_page_size,25), 0);
  v_limit integer := LEAST(GREATEST(COALESCE(p_page_size,25),1), 200);
  v_dir text := CASE WHEN lower(COALESCE(p_sort_dir,'desc')) = 'asc' THEN 'ASC' ELSE 'DESC' END;
  v_order_col text := CASE lower(COALESCE(p_sort_by,'submitted'))
    WHEN 'employee' THEN 'employee_name'
    WHEN 'worked'   THEN 'earned_date'
    WHEN 'expiry'   THEN 'expires_at'
    ELSE 'created_at'
  END;
  v_is_hr_admin boolean := public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin');
  v_is_sales_mgr boolean := public.has_role(auth.uid(),'sales_manager');
  v_sql text;
BEGIN
  IF NOT (v_is_hr_admin OR v_is_sales_mgr) THEN
    RAISE EXCEPTION 'Only HR, Admin or Sales Manager can list pending comp-off credits';
  END IF;

  v_sql := format($f$
    WITH base AS (
      SELECT l.id, l.employee_id, e.name AS employee_name,
             l.earned_date, l.earned_type::text, l.holiday_name,
             l.created_at, (l.expires_at::timestamptz) AS expires_at
      FROM public.compoff_ledger l
      LEFT JOIN public.employees e ON e.id = l.employee_id
      LEFT JOIN public.leave_requests lr ON lr.id = l.leave_request_id
      WHERE l.approval_status = 'pending'
        AND (l.leave_request_id IS NULL OR lr.status NOT IN ('submitted','pending'))
        AND (%9$L::boolean OR public.compoff_employee_is_sales(l.employee_id))
        AND (%1$L::text IS NULL OR e.name ILIKE '%%' || %1$L || '%%')
        AND (%2$L::date IS NULL OR l.earned_date >= %2$L::date)
        AND (%3$L::date IS NULL OR l.earned_date <= %3$L::date)
        AND (
          %4$L = 'all'
          OR (%4$L = 'expired' AND l.expires_at < CURRENT_DATE)
          OR (%4$L = 'expiring_7'  AND l.expires_at >= CURRENT_DATE AND l.expires_at <= CURRENT_DATE + 7)
          OR (%4$L = 'expiring_30' AND l.expires_at >= CURRENT_DATE AND l.expires_at <= CURRENT_DATE + 30)
        )
    ),
    counted AS (SELECT count(*) AS total_count FROM base)
    SELECT b.id, b.employee_id, b.employee_name, b.earned_date, b.earned_type,
           b.holiday_name, b.created_at, b.expires_at, c.total_count
    FROM base b CROSS JOIN counted c
    ORDER BY %5$I %6$s NULLS LAST, b.id ASC
    LIMIT %7$s OFFSET %8$s
  $f$, NULLIF(p_search,''), p_worked_from, p_worked_to, COALESCE(p_expiry_filter,'all'),
       v_order_col, v_dir, v_limit, v_offset, v_is_hr_admin);

  BEGIN
    RETURN QUERY EXECUTE v_sql;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[list_pending_compoff_credits] SQLSTATE=% MESSAGE=% SQL=%',
      SQLSTATE, SQLERRM, v_sql;
    RAISE;
  END;
END; $function$;

-- 5) settle_compoff_leave_decision — allow sales_manager for sales staff
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
  v_leave_emp_id uuid;
  v_is_sales_mgr boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT status, employee_id
    INTO v_leave_prev_status, v_leave_emp_id
    FROM public.leave_requests
   WHERE id = p_leave_id
   FOR UPDATE;

  IF v_leave_prev_status IS NULL THEN
    RAISE EXCEPTION 'Leave request % not found', p_leave_id USING ERRCODE = 'P0002';
  END IF;

  v_is_sales_mgr := has_role(v_uid,'sales_manager'::app_role)
                    AND public.compoff_employee_is_sales(v_leave_emp_id);

  IF NOT (has_role(v_uid,'admin'::app_role) OR has_role(v_uid,'hr'::app_role) OR v_is_sales_mgr) THEN
    RAISE EXCEPTION 'Only HR, Admin or Sales Manager (for sales staff) can settle comp-off leave decisions' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_actor_name FROM public.profiles WHERE id = v_uid;
  IF v_actor_name IS NULL OR btrim(v_actor_name) = '' THEN
    SELECT name INTO v_actor_name FROM public.employees WHERE user_id = v_uid LIMIT 1;
  END IF;
  IF v_actor_name IS NULL OR btrim(v_actor_name) = '' THEN
    v_actor_name := 'HR';
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

-- 6) leave_requests RLS — allow sales_manager to view/manage compoff leaves for sales staff
DROP POLICY IF EXISTS "SalesMgr manage sales compoff leaves" ON public.leave_requests;
CREATE POLICY "SalesMgr manage sales compoff leaves"
  ON public.leave_requests FOR ALL
  USING (
    has_role(auth.uid(), 'sales_manager'::app_role)
    AND leave_type = 'compoff'
    AND public.compoff_employee_is_sales(employee_id)
    AND NOT (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    has_role(auth.uid(), 'sales_manager'::app_role)
    AND leave_type = 'compoff'
    AND public.compoff_employee_is_sales(employee_id)
    AND NOT (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()))
  );
