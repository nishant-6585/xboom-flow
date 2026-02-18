
-- Create attendance_policy_settings table
CREATE TABLE public.attendance_policy_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  work_start_time TIME NOT NULL DEFAULT '09:30:00',
  grace_period_minutes INTEGER NOT NULL DEFAULT 15,
  break_warning_minutes INTEGER NOT NULL DEFAULT 60,
  break_severe_minutes INTEGER NOT NULL DEFAULT 90,
  no_checkout_warning_enabled BOOLEAN NOT NULL DEFAULT false,
  late_alert_enabled BOOLEAN NOT NULL DEFAULT false,
  employee_nudge_enabled BOOLEAN NOT NULL DEFAULT false,
  hr_severe_alert_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Ensure only one policy record can exist
CREATE UNIQUE INDEX attendance_policy_settings_singleton 
  ON public.attendance_policy_settings ((true));

-- Auto-update updated_at
CREATE TRIGGER update_attendance_policy_settings_updated_at
  BEFORE UPDATE ON public.attendance_policy_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.attendance_policy_settings ENABLE ROW LEVEL SECURITY;

-- HR and Admin can view and modify policy
CREATE POLICY "HR and Admin can view attendance policy"
  ON public.attendance_policy_settings
  FOR SELECT
  TO authenticated
  USING (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "HR and Admin can insert attendance policy"
  ON public.attendance_policy_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "HR and Admin can update attendance policy"
  ON public.attendance_policy_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_hr_or_admin(auth.uid()));

-- Seed the single default policy row
INSERT INTO public.attendance_policy_settings (
  work_start_time, grace_period_minutes, break_warning_minutes, break_severe_minutes,
  no_checkout_warning_enabled, late_alert_enabled, employee_nudge_enabled, hr_severe_alert_enabled
) VALUES (
  '09:30:00', 15, 60, 90, false, false, false, false
);
