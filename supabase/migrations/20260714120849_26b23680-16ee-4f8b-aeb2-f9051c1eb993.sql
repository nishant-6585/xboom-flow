-- 1) Automatic balance sync on leave approval / de-approval
CREATE OR REPLACE FUNCTION public.sync_leave_balance_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_year int;
  v_days numeric;
  v_map jsonb := '{
    "EL":"EL","half_day_EL":"EL",
    "casual":"EL","half_day_casual":"EL",
    "paid":"EL","half_day_paid":"EL",
    "sick":"sick","half_day_sick":"sick"
  }'::jsonb;
  v_new_balance numeric;
BEGIN
  v_type := v_map->>NEW.leave_type;
  IF v_type IS NULL THEN RETURN NEW; END IF;

  v_year := EXTRACT(year FROM COALESCE(NEW.start_date, CURRENT_DATE))::int;
  v_days := COALESCE(NEW.total_days, 0);
  IF v_days <= 0 THEN RETURN NEW; END IF;

  -- DEDUCT on approval transition (INSERT-as-approved or UPDATE to approved)
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'approved'
         AND (OLD.status IS DISTINCT FROM 'approved'))
  THEN
    INSERT INTO public.leave_balances(employee_id, leave_type, year, balance)
    VALUES (NEW.employee_id, v_type, v_year, 0)
    ON CONFLICT (employee_id, leave_type, year) DO NOTHING;

    UPDATE public.leave_balances
       SET balance = GREATEST(0, balance - v_days),
           updated_at = now()
     WHERE employee_id = NEW.employee_id
       AND leave_type = v_type
       AND year = v_year
     RETURNING balance INTO v_new_balance;

    INSERT INTO public.leave_transactions(
      employee_id, leave_type, transaction_type, amount, balance_after,
      credit_date, remarks, created_by)
    VALUES (NEW.employee_id, v_type, 'debit', v_days, COALESCE(v_new_balance, 0),
      CURRENT_DATE,
      format('Leave approved (auto trigger): %s (%s days)', NEW.leave_type, v_days),
      COALESCE(NEW.approver_id, auth.uid()));
  END IF;

  -- REFUND when an approved leave moves to a non-approved status
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status IS DISTINCT FROM 'approved' THEN
    INSERT INTO public.leave_balances(employee_id, leave_type, year, balance)
    VALUES (NEW.employee_id, v_type, v_year, 0)
    ON CONFLICT (employee_id, leave_type, year) DO NOTHING;

    UPDATE public.leave_balances
       SET balance = balance + v_days,
           updated_at = now()
     WHERE employee_id = NEW.employee_id
       AND leave_type = v_type
       AND year = v_year
     RETURNING balance INTO v_new_balance;

    INSERT INTO public.leave_transactions(
      employee_id, leave_type, transaction_type, amount, balance_after,
      credit_date, remarks, created_by)
    VALUES (NEW.employee_id, v_type, 'credit', v_days, COALESCE(v_new_balance, 0),
      CURRENT_DATE,
      format('Leave %s — balance refunded (auto): %s (%s days)', NEW.status, NEW.leave_type, v_days),
      COALESCE(NEW.approver_id, auth.uid()));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_leave_balance_on_approval ON public.leave_requests;
CREATE TRIGGER trg_sync_leave_balance_on_approval
AFTER INSERT OR UPDATE OF status ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.sync_leave_balance_on_approval();

-- 2) Tighten self-approval guard: HR can NOT approve their own leave; only admin can.
CREATE OR REPLACE FUNCTION public.guard_leave_requests_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_is_owner boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;

  v_is_admin := public.has_role(v_uid, 'admin'::app_role);
  v_is_owner := EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = NEW.employee_id AND e.user_id = v_uid
  );

  IF v_is_owner AND NOT v_is_admin THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.approver_id IS DISTINCT FROM OLD.approver_id
       OR NEW.approver_name IS DISTINCT FROM OLD.approver_name
       OR NEW.approved_rejected_at IS DISTINCT FROM OLD.approved_rejected_at
       OR NEW.is_hr_applied IS DISTINCT FROM OLD.is_hr_applied
    THEN
      -- Owner may only self-cancel a pending/draft request
      IF NOT (OLD.status IN ('draft','pending')
              AND NEW.status IN ('draft','pending','cancelled'))
      THEN
        RAISE EXCEPTION
          'You cannot approve or reject your own leave request; only an admin can.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_leave_request_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := public.has_role(auth.uid(), 'admin'::app_role);
  v_owns boolean;
BEGIN
  IF v_is_admin THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = NEW.employee_id AND user_id = auth.uid()
  ) INTO v_owns;

  IF NOT v_owns THEN RETURN NEW; END IF;

  IF OLD.status NOT IN ('draft','pending') THEN
    RAISE EXCEPTION 'Leave requests can only be edited while draft or pending';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('draft','pending','cancelled')
  THEN
    RAISE EXCEPTION 'Only an admin can approve or reject your own leave request';
  END IF;

  IF NEW.approver_id   IS DISTINCT FROM OLD.approver_id
     OR NEW.approver_name IS DISTINCT FROM OLD.approver_name
     OR NEW.approved_at   IS DISTINCT FROM OLD.approved_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
  THEN
    RAISE EXCEPTION 'Only an admin can set approver or rejection fields on your own leave requests';
  END IF;

  RETURN NEW;
END;
$$;