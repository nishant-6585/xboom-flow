-- Drop the security definer view and replace with a regular view
DROP VIEW IF EXISTS public.pending_registrations;

-- Create a regular view without security definer
CREATE VIEW public.pending_registrations 
WITH (security_invoker = true)
AS
SELECT 
  p.id,
  p.user_id,
  p.name,
  p.email,
  p.is_approved,
  p.created_at,
  ur.role
FROM public.profiles p
LEFT JOIN public.user_roles ur ON p.user_id = ur.user_id
WHERE p.is_approved = false;