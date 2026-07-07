REVOKE ALL ON FUNCTION public.link_portal_contact_auth_user_by_email() FROM anon;
REVOKE ALL ON FUNCTION public.link_portal_contact_auth_user_by_email() FROM authenticated;
REVOKE ALL ON FUNCTION public.link_portal_contact_auth_user_by_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_portal_contact_auth_user_by_email() TO service_role;