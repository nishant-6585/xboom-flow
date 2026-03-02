
-- Table to store attendance correction requests pending HR approval
CREATE TABLE public.attendance_correction_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attendance_log_id UUID NOT NULL REFERENCES public.attendance_logs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  requested_by_name TEXT NOT NULL,
  current_check_in_time TIMESTAMPTZ,
  current_check_out_time TIMESTAMPTZ,
  requested_check_in_time TIMESTAMPTZ,
  requested_check_out_time TIMESTAMPTZ,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.attendance_correction_requests ENABLE ROW LEVEL SECURITY;

-- Employees can view their own requests
CREATE POLICY "Employees can view own correction requests"
ON public.attendance_correction_requests
FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND is_user_approved(auth.uid())
);

-- Employees can create their own correction requests
CREATE POLICY "Employees can create own correction requests"
ON public.attendance_correction_requests
FOR INSERT
WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND is_user_approved(auth.uid())
);

-- HR and Admin can view all correction requests
CREATE POLICY "HR and Admin can view all correction requests"
ON public.attendance_correction_requests
FOR SELECT
USING (is_hr_or_admin(auth.uid()));

-- HR and Admin can update (approve/reject) correction requests
CREATE POLICY "HR and Admin can update correction requests"
ON public.attendance_correction_requests
FOR UPDATE
USING (is_hr_or_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_correction_requests_updated_at
BEFORE UPDATE ON public.attendance_correction_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
