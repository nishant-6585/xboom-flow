
-- Add resignation_date and created_by fields, make user_id nullable for HR-created entries
ALTER TABLE public.resignation_requests 
  ADD COLUMN IF NOT EXISTS resignation_date DATE,
  ADD COLUMN IF NOT EXISTS created_by_hr UUID,
  ADD COLUMN IF NOT EXISTS created_by_hr_name TEXT;

-- Make user_id nullable so HR can create resignations for employees without user accounts
ALTER TABLE public.resignation_requests ALTER COLUMN user_id DROP NOT NULL;

-- Update existing rows to use created_at date as resignation_date
UPDATE public.resignation_requests SET resignation_date = created_at::date WHERE resignation_date IS NULL;
