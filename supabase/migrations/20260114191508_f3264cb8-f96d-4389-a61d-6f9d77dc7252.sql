-- Add break time columns to attendance_logs table
ALTER TABLE attendance_logs 
ADD COLUMN IF NOT EXISTS break_start_time timestamptz,
ADD COLUMN IF NOT EXISTS break_end_time timestamptz,
ADD COLUMN IF NOT EXISTS total_break_minutes numeric DEFAULT 0;

-- Update the calculate_working_hours function to account for break time
CREATE OR REPLACE FUNCTION calculate_working_hours()
RETURNS TRIGGER AS $$
BEGIN
  -- Only calculate if both check_in and check_out times are set
  IF NEW.check_in_time IS NOT NULL AND NEW.check_out_time IS NOT NULL THEN
    -- Calculate total hours
    DECLARE
      total_hours numeric;
      break_hours numeric := 0;
    BEGIN
      total_hours := EXTRACT(EPOCH FROM (NEW.check_out_time::timestamp - NEW.check_in_time::timestamp)) / 3600;
      
      -- Subtract break time if present
      IF NEW.total_break_minutes IS NOT NULL AND NEW.total_break_minutes > 0 THEN
        break_hours := NEW.total_break_minutes / 60;
        total_hours := total_hours - break_hours;
      END IF;
      
      NEW.working_hours := GREATEST(0, total_hours);
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;