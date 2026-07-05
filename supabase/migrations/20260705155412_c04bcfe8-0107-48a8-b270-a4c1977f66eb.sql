
-- ============================================================
-- leave_requests: block self-approval decision-column writes
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_leave_requests_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_privileged boolean;
  v_is_owner boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW; -- service_role / internal
  END IF;

  v_is_privileged := public.has_role(v_uid, 'admin'::app_role)
                  OR public.has_role(v_uid, 'hr'::app_role);
  IF v_is_privileged THEN
    RETURN NEW;
  END IF;

  v_is_owner := EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = NEW.employee_id AND e.user_id = v_uid
  );

  IF NOT v_is_owner THEN
    RETURN NEW; -- other RLS handles ownership; nothing to guard here
  END IF;

  -- Owner may not touch approval / decision columns
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.approver_id IS DISTINCT FROM OLD.approver_id
     OR NEW.approver_name IS DISTINCT FROM OLD.approver_name
     OR NEW.approved_rejected_at IS DISTINCT FROM OLD.approved_rejected_at
     OR NEW.is_hr_applied IS DISTINCT FROM OLD.is_hr_applied
  THEN
    RAISE EXCEPTION
      'Employees cannot modify approval fields on their own leave requests'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_leave_requests_self_approval ON public.leave_requests;
CREATE TRIGGER trg_guard_leave_requests_self_approval
BEFORE UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_leave_requests_self_approval();


-- ============================================================
-- resignation_requests: block self-approval decision-column writes
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_resignation_requests_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_privileged boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_privileged := public.has_role(v_uid, 'admin'::app_role)
                  OR public.has_role(v_uid, 'hr'::app_role);
  IF v_is_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM v_uid THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.approved_lwd IS DISTINCT FROM OLD.approved_lwd
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_by_name IS DISTINCT FROM OLD.reviewed_by_name
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.hr_notes IS DISTINCT FROM OLD.hr_notes
     OR NEW.resignation_date IS DISTINCT FROM OLD.resignation_date
  THEN
    RAISE EXCEPTION
      'Employees cannot modify decision fields on their own resignation request'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_resignation_requests_self_approval ON public.resignation_requests;
CREATE TRIGGER trg_guard_resignation_requests_self_approval
BEFORE UPDATE ON public.resignation_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_resignation_requests_self_approval();


-- ============================================================
-- sales_faqs: block self-approval of own questions
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_sales_faqs_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(v_uid, 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Non-admins editing their own FAQ row may not touch approval columns
  IF NEW.asked_by = v_uid THEN
    IF NEW.is_approved IS DISTINCT FROM OLD.is_approved
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_by_name IS DISTINCT FROM OLD.approved_by_name
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.is_pinned IS DISTINCT FROM OLD.is_pinned
    THEN
      RAISE EXCEPTION
        'Only admins can approve or pin sales FAQs'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sales_faqs_self_approval ON public.sales_faqs;
CREATE TRIGGER trg_guard_sales_faqs_self_approval
BEFORE UPDATE ON public.sales_faqs
FOR EACH ROW EXECUTE FUNCTION public.guard_sales_faqs_self_approval();
