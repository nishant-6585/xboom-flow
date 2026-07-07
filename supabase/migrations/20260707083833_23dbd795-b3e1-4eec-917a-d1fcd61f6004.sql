-- Backfill portal_contacts.last_login_at from auth.users.last_sign_in_at
-- for portal users who logged in before the touch_portal_last_login RPC was wired.
UPDATE public.portal_contacts pc
   SET last_login_at = au.last_sign_in_at
  FROM auth.users au
 WHERE pc.auth_user_id = au.id
   AND au.last_sign_in_at IS NOT NULL
   AND (pc.last_login_at IS NULL OR pc.last_login_at < au.last_sign_in_at);