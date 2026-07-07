CREATE OR REPLACE FUNCTION public.get_portal_contacts_with_auth_login()
RETURNS TABLE (
  id uuid,
  account_id uuid,
  full_name text,
  email text,
  phone text,
  whatsapp_number text,
  role text,
  is_active boolean,
  invited_at timestamptz,
  last_login_at timestamptz,
  auth_user_id uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pc.id,
    pc.account_id,
    pc.full_name,
    pc.email,
    pc.phone,
    pc.whatsapp_number,
    pc.role,
    pc.is_active,
    pc.invited_at,
    au.last_sign_in_at AS last_login_at,
    COALESCE(pc.auth_user_id, au.id) AS auth_user_id,
    pc.created_at
  FROM public.portal_contacts pc
  LEFT JOIN LATERAL (
    SELECT u.id, u.last_sign_in_at
    FROM auth.users u
    WHERE u.id = pc.auth_user_id
       OR (pc.auth_user_id IS NULL AND lower(u.email) = lower(pc.email))
    ORDER BY CASE WHEN u.id = pc.auth_user_id THEN 0 ELSE 1 END, u.last_sign_in_at DESC NULLS LAST, u.created_at DESC
    LIMIT 1
  ) au ON true
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.has_role(auth.uid(), 'sales'::public.app_role)
     OR public.has_role(auth.uid(), 'sales_manager'::public.app_role)
     OR public.has_role(auth.uid(), 'support'::public.app_role)
     OR public.has_role(auth.uid(), 'finance'::public.app_role)
     OR public.has_role(auth.uid(), 'supply_chain'::public.app_role)
     OR public.has_role(auth.uid(), 'it'::public.app_role)
     OR public.has_role(auth.uid(), 'hr'::public.app_role)
     OR public.has_role(auth.uid(), 'marketing'::public.app_role);
$$;

REVOKE ALL ON FUNCTION public.get_portal_contacts_with_auth_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_contacts_with_auth_login() TO authenticated;

COMMENT ON FUNCTION public.get_portal_contacts_with_auth_login() IS 'Staff-only portal contact listing that sources last login from auth.users.last_sign_in_at, with email fallback for older unlinked contacts.';