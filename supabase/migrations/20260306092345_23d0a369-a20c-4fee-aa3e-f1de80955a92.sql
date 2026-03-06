
-- Add new values to the salary_sheet_status enum
ALTER TYPE public.salary_sheet_status ADD VALUE IF NOT EXISTS 'hr_approved';
ALTER TYPE public.salary_sheet_status ADD VALUE IF NOT EXISTS 'finance_approved';
