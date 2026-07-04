
-- 1. RPC: portal contact stamps their own last_login_at (bypasses RLS)
CREATE OR REPLACE FUNCTION public.touch_portal_last_login()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.portal_contacts
     SET last_login_at = now()
   WHERE auth_user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.touch_portal_last_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_portal_last_login() TO authenticated;

-- 2. One-time backfill from auth.users.last_sign_in_at
UPDATE public.portal_contacts pc
   SET last_login_at = u.last_sign_in_at
  FROM auth.users u
 WHERE pc.auth_user_id = u.id
   AND u.last_sign_in_at IS NOT NULL
   AND (pc.last_login_at IS NULL OR pc.last_login_at < u.last_sign_in_at);
