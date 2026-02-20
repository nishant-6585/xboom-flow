
-- Add soft auto-checkout fields to attendance_logs
ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS auto_checkout_applied boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_checkout_time timestamptz,
  ADD COLUMN IF NOT EXISTS is_provisional_checkout boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS corrected_by uuid,
  ADD COLUMN IF NOT EXISTS corrected_at timestamptz;

-- Create attendance audit log table for auto-checkout events
CREATE TABLE IF NOT EXISTS public.attendance_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attendance_log_id uuid NOT NULL REFERENCES public.attendance_logs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  event_type text NOT NULL, -- 'AUTO_CHECKOUT_APPLIED' | 'AUTO_CHECKOUT_CORRECTED'
  event_time timestamptz NOT NULL DEFAULT now(),
  performed_by uuid,
  performed_by_name text,
  old_checkout_time timestamptz,
  new_checkout_time timestamptz,
  notes text,
  metadata jsonb
);

-- Enable RLS
ALTER TABLE public.attendance_audit_log ENABLE ROW LEVEL SECURITY;

-- HR and admin can view all audit logs
CREATE POLICY "HR and admin can view attendance audit logs"
  ON public.attendance_audit_log FOR SELECT
  USING (public.is_hr_or_admin(auth.uid()));

-- Service role can insert (for edge functions)
CREATE POLICY "Service role can insert audit logs"
  ON public.attendance_audit_log FOR INSERT
  WITH CHECK (true);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_attendance_audit_log_employee ON public.attendance_audit_log(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_audit_log_attendance ON public.attendance_audit_log(attendance_log_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_provisional ON public.attendance_logs(is_provisional_checkout) WHERE is_provisional_checkout = true;
