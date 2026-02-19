
ALTER TABLE public.attendance_policy_settings
ADD COLUMN IF NOT EXISTS auto_checkout_hours numeric NOT NULL DEFAULT 9;
