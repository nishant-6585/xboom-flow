-- Fix security warnings by setting search_path on functions
CREATE OR REPLACE FUNCTION calculate_working_hours()
RETURNS TRIGGER AS $$
BEGIN
  -- Only calculate if both check_in and check_out times are set
  IF NEW.check_in_time IS NOT NULL AND NEW.check_out_time IS NOT NULL THEN
    -- Calculate hours difference
    NEW.working_hours := EXTRACT(EPOCH FROM (NEW.check_out_time::timestamp - NEW.check_in_time::timestamp)) / 3600;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

CREATE OR REPLACE FUNCTION auto_create_employee()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if employee already exists for this user
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE user_id = NEW.user_id) THEN
    INSERT INTO public.employees (user_id, name, department, role, work_location, shift_type, shift_start_time, shift_end_time, weekly_hours_target, monthly_attendance_target, is_active)
    VALUES (NEW.user_id, NEW.name, 'General', NULL, 'Office', 'Fixed', '09:00:00', '18:00:00', 48, 95, true);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;