
-- Step 1: Merge casual leave balances into paid leave balances
-- Add casual balance to paid balance where both exist
UPDATE public.leave_balances lb_paid
SET balance = lb_paid.balance + lb_casual.balance,
    updated_at = now()
FROM public.leave_balances lb_casual
WHERE lb_paid.employee_id = lb_casual.employee_id
  AND lb_paid.year = lb_casual.year
  AND lb_paid.leave_type = 'paid'
  AND lb_casual.leave_type = 'casual';

-- Where only casual exists (no paid), convert casual to paid
UPDATE public.leave_balances
SET leave_type = 'paid', updated_at = now()
WHERE leave_type = 'casual'
  AND NOT EXISTS (
    SELECT 1 FROM public.leave_balances lb2
    WHERE lb2.employee_id = leave_balances.employee_id
      AND lb2.year = leave_balances.year
      AND lb2.leave_type = 'paid'
  );

-- Delete remaining casual entries (ones that were merged above)
DELETE FROM public.leave_balances WHERE leave_type = 'casual';

-- Step 2: Add a migration transaction record for audit
INSERT INTO public.leave_transactions (employee_id, leave_type, transaction_type, amount, balance_after, credit_date, remarks, created_by)
SELECT employee_id, 'paid', 'credit', 0, balance, CURRENT_DATE, 'Casual Leave balance merged into Paid Leave', 'system'
FROM public.leave_balances
WHERE leave_type = 'paid';

-- Step 3: Update the check constraint on leave_requests to remove casual types
-- First drop the old constraint if it exists
DO $$
BEGIN
  -- Try to drop the constraint (it may have different names)
  BEGIN
    ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- Add updated constraint without casual types
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_leave_type_check 
  CHECK (leave_type IN ('sick', 'paid', 'unpaid', 'half_day', 'half_day_sick', 'half_day_paid', 'half_day_unpaid', 'wfh', 'casual', 'half_day_casual'));
-- Note: We keep casual/half_day_casual in constraint for historical data integrity but remove from UI
