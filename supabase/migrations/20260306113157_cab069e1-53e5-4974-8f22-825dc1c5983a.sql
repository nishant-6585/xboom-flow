
-- Create employment_status enum
CREATE TYPE public.employment_status AS ENUM ('active', 'probation', 'resigned', 'terminated');

-- Add joining_date, exit_date, employment_status to employees
ALTER TABLE public.employees
  ADD COLUMN joining_date DATE DEFAULT NULL,
  ADD COLUMN exit_date DATE DEFAULT NULL,
  ADD COLUMN employment_status public.employment_status NOT NULL DEFAULT 'active';
