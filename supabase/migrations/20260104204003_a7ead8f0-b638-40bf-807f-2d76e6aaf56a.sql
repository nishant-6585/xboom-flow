-- Create a secure function to get pending registrations (admin only)
-- This replaces direct access to the pending_registrations view
CREATE OR REPLACE FUNCTION public.get_pending_registrations()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  name text,
  email text,
  role app_role,
  is_approved boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.user_id,
    p.name,
    p.email,
    ur.role,
    p.is_approved,
    p.created_at
  FROM public.profiles p
  JOIN public.user_roles ur ON p.user_id = ur.user_id
  WHERE p.is_approved = false
    AND has_role(auth.uid(), 'admin'::app_role)
    AND is_user_approved(auth.uid())
  ORDER BY p.created_at DESC
$$;

-- Revoke direct access to the view from all roles
REVOKE ALL ON public.pending_registrations FROM anon;
REVOKE ALL ON public.pending_registrations FROM authenticated;

-- Grant execute on the secure function to authenticated users only
GRANT EXECUTE ON FUNCTION public.get_pending_registrations() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pending_registrations() FROM anon;