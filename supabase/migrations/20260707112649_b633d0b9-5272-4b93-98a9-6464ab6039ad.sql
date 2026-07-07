CREATE OR REPLACE FUNCTION public.link_portal_contact_auth_user_by_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id uuid;
BEGIN
  IF NEW.auth_user_id IS NULL AND NEW.email IS NOT NULL THEN
    SELECT u.id
      INTO v_auth_user_id
      FROM auth.users u
     WHERE lower(u.email) = lower(NEW.email)
     ORDER BY u.created_at DESC
     LIMIT 1;

    IF v_auth_user_id IS NOT NULL THEN
      NEW.auth_user_id := v_auth_user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_portal_contact_auth_user_by_email ON public.portal_contacts;
CREATE TRIGGER trg_link_portal_contact_auth_user_by_email
BEFORE INSERT OR UPDATE OF email, auth_user_id ON public.portal_contacts
FOR EACH ROW
EXECUTE FUNCTION public.link_portal_contact_auth_user_by_email();

REVOKE ALL ON FUNCTION public.link_portal_contact_auth_user_by_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_portal_contact_auth_user_by_email() TO service_role;