-- Drop the insecure pending_registrations view
-- The get_pending_registrations() function already provides secure access with proper admin checks
DROP VIEW IF EXISTS public.pending_registrations;