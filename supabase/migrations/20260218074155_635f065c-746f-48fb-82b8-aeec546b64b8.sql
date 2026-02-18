
-- Add source and reconciliation_status columns to attendance_logs
ALTER TABLE public.attendance_logs 
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'xboom',
ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'pending';

-- Create attendance_breaks table for tracking multiple breaks
CREATE TABLE IF NOT EXISTS public.attendance_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid NOT NULL REFERENCES public.attendance_logs(id) ON DELETE CASCADE,
  break_start_time timestamptz NOT NULL,
  break_end_time timestamptz,
  break_duration_minutes numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on attendance_breaks
ALTER TABLE public.attendance_breaks ENABLE ROW LEVEL SECURITY;

-- Employees can manage their own breaks (via attendance_logs)
CREATE POLICY "Employees can view own breaks"
ON public.attendance_breaks
FOR SELECT
USING (
  attendance_id IN (
    SELECT al.id FROM public.attendance_logs al
    JOIN public.employees e ON e.id = al.employee_id
    WHERE e.user_id = auth.uid()
  )
);

CREATE POLICY "Employees can insert own breaks"
ON public.attendance_breaks
FOR INSERT
WITH CHECK (
  attendance_id IN (
    SELECT al.id FROM public.attendance_logs al
    JOIN public.employees e ON e.id = al.employee_id
    WHERE e.user_id = auth.uid()
  )
);

CREATE POLICY "Employees can update own breaks"
ON public.attendance_breaks
FOR UPDATE
USING (
  attendance_id IN (
    SELECT al.id FROM public.attendance_logs al
    JOIN public.employees e ON e.id = al.employee_id
    WHERE e.user_id = auth.uid()
  )
);

-- HR/Admin can view all breaks
CREATE POLICY "HR/Admin can view all breaks"
ON public.attendance_breaks
FOR ALL
USING (public.is_hr_or_admin(auth.uid()));

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_attendance_breaks_attendance_id ON public.attendance_breaks(attendance_id);
