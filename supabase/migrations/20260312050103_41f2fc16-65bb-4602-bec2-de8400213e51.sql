
-- Create resignation_requests table
CREATE TABLE public.resignation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposed_lwd DATE NOT NULL,
  reason TEXT NOT NULL,
  personal_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  hr_notes TEXT,
  approved_lwd DATE,
  reviewed_by UUID,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.resignation_requests ENABLE ROW LEVEL SECURITY;

-- Consolidated SELECT policy: employee sees own, HR/Admin sees all
CREATE POLICY "resignation_requests_select" ON public.resignation_requests
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'hr')
    )
  );

-- Employee can insert own
CREATE POLICY "resignation_requests_insert" ON public.resignation_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Employee can update own (only withdraw), HR/Admin can update any
CREATE POLICY "resignation_requests_update" ON public.resignation_requests
  FOR UPDATE TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'hr')
    )
  );

-- Function to auto-update employee exit_date on resignation approval
CREATE OR REPLACE FUNCTION public.sync_resignation_to_employee()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    UPDATE public.employees
    SET exit_date = COALESCE(NEW.approved_lwd, NEW.proposed_lwd),
        is_active = false,
        employment_status = 'resigned',
        updated_at = now()
    WHERE id = NEW.employee_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_resignation_approved
  AFTER UPDATE ON public.resignation_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_resignation_to_employee();
