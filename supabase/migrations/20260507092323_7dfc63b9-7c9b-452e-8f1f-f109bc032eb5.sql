-- Raise auto-checkout safety threshold and clear stale provisional checkouts
UPDATE public.attendance_policy_settings
SET auto_checkout_hours = 14
WHERE auto_checkout_hours IS DISTINCT FROM 14;

-- Clear provisional flag on existing auto-checkouts so HR isn't flooded with correction prompts
UPDATE public.attendance_logs
SET is_provisional_checkout = false
WHERE is_provisional_checkout = true;