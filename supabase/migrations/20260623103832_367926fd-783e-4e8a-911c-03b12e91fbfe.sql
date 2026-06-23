
-- 1) Prevent duplicate / overlapping leave requests for the same employee
CREATE OR REPLACE FUNCTION public.prevent_overlapping_leave_requests()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflict_id uuid;
  v_conflict_dates text;
BEGIN
  -- Only enforce for active (non-rejected/non-cancelled) requests
  IF NEW.status IN ('rejected', 'cancelled') THEN
    RETURN NEW;
  END IF;

  SELECT id, (start_date::text || ' to ' || end_date::text)
    INTO v_conflict_id, v_conflict_dates
  FROM public.leave_requests
  WHERE employee_id = NEW.employee_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status IN ('pending', 'approved')
    AND daterange(start_date, end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate leave: this employee already has a % leave request for overlapping dates (%). Please cancel the existing one before applying a new request.',
      (SELECT status FROM public.leave_requests WHERE id = v_conflict_id),
      v_conflict_dates
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_overlapping_leave_requests ON public.leave_requests;
CREATE TRIGGER trg_prevent_overlapping_leave_requests
BEFORE INSERT OR UPDATE OF start_date, end_date, status, employee_id
ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.prevent_overlapping_leave_requests();

-- 2) Fix Narasimha's EL balance: remove the duplicate request created by HR
-- (dated 2025-06-19/20, applied 2026-06-18 by Harshita) and refund 1 EL day
-- so balance moves from 18.25 → 19.25 (matching ~19.5 expected).
DO $$
DECLARE
  v_emp uuid := '79d3bb1a-b683-4bf9-9b3d-fe469d177f93';
  v_dup uuid := '1f23d147-1dce-4743-ac8f-d9544e7d781b';
  v_current numeric;
BEGIN
  -- Mark duplicate request as cancelled instead of hard-delete to preserve audit trail
  UPDATE public.leave_requests
     SET status = 'cancelled',
         reason = COALESCE(reason,'') || ' [Cancelled: duplicate of self-applied 2026-06-19/20]'
   WHERE id = v_dup;

  SELECT balance INTO v_current
    FROM public.leave_balances
   WHERE employee_id = v_emp AND leave_type = 'EL' AND year = 2026
   FOR UPDATE;

  UPDATE public.leave_balances
     SET balance = v_current + 1,
         updated_at = now()
   WHERE employee_id = v_emp AND leave_type = 'EL' AND year = 2026;

  INSERT INTO public.leave_transactions
    (employee_id, leave_type, transaction_type, amount, balance_after, credit_date, remarks, created_by)
  VALUES
    (v_emp, 'EL', 'credit', 1.00, v_current + 1, CURRENT_DATE,
     'Reversal: duplicate leave applied by HR for 19-20 June (overlap with self-applied request)',
     'system');
END $$;
