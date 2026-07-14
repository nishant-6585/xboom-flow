-- CompOff: single-visible-request UX
-- 1. Exclude ledger rows linked to a still-pending leave_request from the credit inbox.
-- 2. Atomic settlement RPC used by leave approval so both sides move in one transaction.

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
RETURNS TABLE(
  id uuid, employee_id uuid, employee_name text, earned_date date,
  earned_type text, holiday_name text,
  created_at timestamp with time zone, expires_at timestamp with time zone,
  total_count bigint
)
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
  v_sql text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Only HR or Admin can list pending comp-off credits';
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
        -- Hide credits represented by an in-flight leave request; the leave
        -- approval decides both records in one action. Standalone credits
        -- (leave_request_id NULL) and credits whose linked leave was
        -- rejected/cancelled remain visible for a standalone decision.
        AND (l.leave_request_id IS NULL OR lr.status NOT IN ('submitted','pending'))
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
       v_order_col, v_dir, v_limit, v_offset);

  BEGIN
    RETURN QUERY EXECUTE v_sql;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[list_pending_compoff_credits] SQLSTATE=% MESSAGE=% SQL=%',
      SQLSTATE, SQLERRM, v_sql;
    RAISE;
  END;
END; $function$;


-- Atomic settlement of a compoff leave decision.
-- Called from the leave approval flow AFTER leave_requests.status has been updated.
-- Approve  -> ledger approval_status='approved', status='redeemed', redeemed_on=today.
-- Reject   -> clear leave_request_id link so credit re-surfaces in the credit inbox
--             as a standalone PENDING decision (employee genuinely worked that day).
CREATE OR REPLACE FUNCTION public.settle_compoff_leave_decision(
  p_leave_id uuid,
  p_approve boolean,
  p_comment text DEFAULT NULL
)
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (has_role(v_uid,'admin'::app_role) OR has_role(v_uid,'hr'::app_role)) THEN
    RAISE EXCEPTION 'Only HR or Admin can settle comp-off leave decisions' USING ERRCODE = '42501';
  END IF;

  SELECT id, employee_id, earned_date, earned_type, approval_status, status
    INTO v_ledger
  FROM public.compoff_ledger
  WHERE leave_request_id = p_leave_id
  LIMIT 1;

  IF v_ledger.id IS NULL THEN
    RETURN jsonb_build_object('linked', false);
  END IF;

  SELECT name INTO v_actor_name FROM public.profiles WHERE id = v_uid;
  SELECT user_id INTO v_emp_user_id FROM public.employees WHERE id = v_ledger.employee_id;

  IF p_approve THEN
    -- Approve credit (if still pending) AND redeem it, in one transaction.
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
      -- Already-approved (banked) credit: just redeem.
      UPDATE public.compoff_ledger
         SET status = 'redeemed', redeemed_on = CURRENT_DATE
       WHERE id = v_ledger.id;
    END IF;

    RETURN jsonb_build_object('linked', true, 'action', 'approved_and_redeemed', 'ledger_id', v_ledger.id);
  ELSE
    -- Reject: keep the credit alive but detach it from this leave so it
    -- surfaces as a standalone pending decision in the credit inbox.
    UPDATE public.compoff_ledger
       SET leave_request_id = NULL,
           status = 'available',
           redeemed_on = NULL,
           -- If it had somehow been approved earlier, revert to pending so
           -- HR can consciously bank/void the standalone credit.
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

GRANT EXECUTE ON FUNCTION public.settle_compoff_leave_decision(uuid, boolean, text) TO authenticated;