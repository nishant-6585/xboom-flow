-- Create a secure RPC to list approved sales team members (for dropdowns)
CREATE OR REPLACE FUNCTION public.get_sales_team()
RETURNS TABLE(user_id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.user_id, p.name
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE p.is_approved = true
    AND ur.role = 'sales'::app_role
    AND is_user_approved(auth.uid())
  ORDER BY p.name ASC;
$$;