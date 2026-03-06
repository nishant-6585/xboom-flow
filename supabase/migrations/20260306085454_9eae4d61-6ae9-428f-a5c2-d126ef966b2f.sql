ALTER TABLE public.salary_sheet_entries 
  ADD COLUMN IF NOT EXISTS wfh_days_override boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS unpaid_leaves_override boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS el_leaves_override boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sl_leaves_override boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deductions_override boolean DEFAULT false;