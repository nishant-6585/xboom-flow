
-- Leave balances table
CREATE TABLE public.leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL DEFAULT 'EL',
  balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, leave_type, year)
);

-- Leave transactions table for audit trail
CREATE TABLE public.leave_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL DEFAULT 'EL',
  transaction_type TEXT NOT NULL DEFAULT 'credit',
  amount NUMERIC(10,2) NOT NULL,
  balance_after NUMERIC(10,2) NOT NULL DEFAULT 0,
  credit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  credit_month INTEGER,
  credit_year INTEGER,
  remarks TEXT,
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_transactions ENABLE ROW LEVEL SECURITY;

-- RLS: Authenticated users can read their own balance; HR/admin can read all
CREATE POLICY "Users can view own leave balances" ON public.leave_balances
  FOR SELECT TO authenticated
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'hr'))
  );

CREATE POLICY "System and admin can manage leave balances" ON public.leave_balances
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'hr')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'hr')));

CREATE POLICY "Users can view own leave transactions" ON public.leave_transactions
  FOR SELECT TO authenticated
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'hr'))
  );

CREATE POLICY "System and admin can insert leave transactions" ON public.leave_transactions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'hr')));

-- Function to credit EL (called by edge function with service role)
CREATE OR REPLACE FUNCTION public.credit_monthly_el(p_month INTEGER, p_year INTEGER, p_credit_amount NUMERIC DEFAULT 1.75)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_employee RECORD;
  v_credited_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
  v_new_balance NUMERIC;
BEGIN
  FOR v_employee IN
    SELECT id FROM public.employees
    WHERE is_active = true
      AND employment_status = 'active'
      AND (joining_date IS NULL OR joining_date < date_trunc('month', make_date(p_year, p_month, 1)))
  LOOP
    -- Check for duplicate credit
    IF EXISTS (
      SELECT 1 FROM public.leave_transactions
      WHERE employee_id = v_employee.id
        AND leave_type = 'EL'
        AND transaction_type = 'credit'
        AND credit_month = p_month
        AND credit_year = p_year
        AND remarks = 'Monthly Earned Leave Credit'
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- Upsert leave balance
    INSERT INTO public.leave_balances (employee_id, leave_type, balance, year)
    VALUES (v_employee.id, 'EL', p_credit_amount, p_year)
    ON CONFLICT (employee_id, leave_type, year)
    DO UPDATE SET balance = leave_balances.balance + p_credit_amount, updated_at = now();

    -- Get new balance
    SELECT balance INTO v_new_balance FROM public.leave_balances
    WHERE employee_id = v_employee.id AND leave_type = 'EL' AND year = p_year;

    -- Insert transaction record
    INSERT INTO public.leave_transactions (employee_id, leave_type, transaction_type, amount, balance_after, credit_date, credit_month, credit_year, remarks, created_by)
    VALUES (v_employee.id, 'EL', 'credit', p_credit_amount, v_new_balance, CURRENT_DATE, p_month, p_year, 'Monthly Earned Leave Credit', 'system');

    v_credited_count := v_credited_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'credited_count', v_credited_count,
    'skipped_count', v_skipped_count,
    'month', p_month,
    'year', p_year
  );
END;
$$;
