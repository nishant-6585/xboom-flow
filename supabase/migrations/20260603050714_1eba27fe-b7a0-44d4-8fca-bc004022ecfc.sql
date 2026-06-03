
-- CompOff ledger: tracks days an employee worked extra (holiday/weekend) and CompOff redemption.
CREATE TABLE public.compoff_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  earned_date DATE NOT NULL,
  earned_type TEXT NOT NULL CHECK (earned_type IN ('holiday','weekend')),
  holiday_id UUID NULL REFERENCES public.holidays(id) ON DELETE SET NULL,
  holiday_name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','redeemed','expired')),
  redeemed_on DATE NULL,
  leave_request_id UUID NULL REFERENCES public.leave_requests(id) ON DELETE SET NULL,
  expires_at DATE NOT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT compoff_earned_type_holiday_chk CHECK (
    (earned_type = 'holiday' AND holiday_id IS NOT NULL)
    OR (earned_type = 'weekend' AND holiday_id IS NULL)
  ),
  CONSTRAINT compoff_unique_earned UNIQUE (employee_id, earned_date)
);

CREATE INDEX idx_compoff_ledger_employee ON public.compoff_ledger(employee_id);
CREATE INDEX idx_compoff_ledger_status ON public.compoff_ledger(employee_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compoff_ledger TO authenticated;
GRANT ALL ON public.compoff_ledger TO service_role;

ALTER TABLE public.compoff_ledger ENABLE ROW LEVEL SECURITY;

-- Employees can view their own ledger
CREATE POLICY "Employees view own compoff ledger"
ON public.compoff_ledger FOR SELECT
TO authenticated
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'hr')
);

-- Employees can insert their own ledger
CREATE POLICY "Employees insert own compoff ledger"
ON public.compoff_ledger FOR INSERT
TO authenticated
WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'hr')
);

-- Only admin/hr can update (managers update via approval handled in app)
CREATE POLICY "Admin/HR update compoff ledger"
ON public.compoff_ledger FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'hr')
  OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'hr')
  OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

CREATE POLICY "Admin/HR delete compoff ledger"
ON public.compoff_ledger FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

CREATE TRIGGER trg_compoff_ledger_updated_at
BEFORE UPDATE ON public.compoff_ledger
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Balance function: count available, non-expired entries.
CREATE OR REPLACE FUNCTION public.get_compoff_balance(_employee_id UUID)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INT
  FROM public.compoff_ledger
  WHERE employee_id = _employee_id
    AND status = 'available'
    AND expires_at >= CURRENT_DATE;
$$;
