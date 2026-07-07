REVOKE ALL ON FUNCTION public.get_portal_contacts_with_auth_login() FROM anon;
REVOKE ALL ON FUNCTION public.get_portal_contacts_with_auth_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_contacts_with_auth_login() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_portal_team_with_auth_login()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role text,
  is_active boolean,
  last_login_at timestamptz,
  invited_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller AS (
    SELECT pc.account_id
    FROM public.portal_contacts pc
    WHERE pc.auth_user_id = auth.uid()
      AND pc.is_active = true
      AND pc.role = 'admin'
    LIMIT 1
  )
  SELECT
    pc.id,
    pc.full_name,
    pc.email,
    pc.role,
    pc.is_active,
    au.last_sign_in_at AS last_login_at,
    pc.invited_at
  FROM caller
  JOIN public.portal_contacts pc ON pc.account_id = caller.account_id
  LEFT JOIN LATERAL (
    SELECT u.id, u.last_sign_in_at
    FROM auth.users u
    WHERE u.id = pc.auth_user_id
       OR (pc.auth_user_id IS NULL AND lower(u.email) = lower(pc.email))
    ORDER BY CASE WHEN u.id = pc.auth_user_id THEN 0 ELSE 1 END, u.last_sign_in_at DESC NULLS LAST, u.created_at DESC
    LIMIT 1
  ) au ON true
  ORDER BY pc.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_my_portal_team_with_auth_login() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_portal_team_with_auth_login() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_portal_team_with_auth_login() TO authenticated;

COMMENT ON FUNCTION public.get_my_portal_team_with_auth_login() IS 'Customer-admin team listing that sources teammate last login from auth.users.last_sign_in_at, with email fallback for legacy unlinked contacts.';