ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS applied_by_id UUID;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS applied_by_name TEXT;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS is_hr_applied BOOLEAN DEFAULT false;