-- 1. Drop the unused table-level INSERT grant so authenticated no longer
--    holds implicit INSERT rights on access_token/refresh_token. New Gmail
--    integrations are always inserted via the OAuth edge function which uses
--    the service role.
REVOKE INSERT ON public.gmail_integrations FROM authenticated;
REVOKE INSERT, UPDATE, SELECT, DELETE ON public.gmail_integrations FROM anon;

-- 2. Belt-and-braces column revokes (no-op if not held).
DO $$
BEGIN
  EXECUTE 'REVOKE SELECT (access_token, refresh_token) ON public.gmail_integrations FROM authenticated, anon';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Permission audit function — returns one row per expectation.
CREATE OR REPLACE FUNCTION public.audit_gmail_integrations_grants()
RETURNS TABLE(check_name text, ok boolean, detail text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'gmail_integrations' AND grantee = 'anon';
  check_name := 'anon_no_table_grants';
  ok := (v_count = 0);
  detail := format('anon table-grant count = %s (expected 0)', v_count);
  RETURN NEXT;

  SELECT COUNT(*) INTO v_count
    FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND table_name = 'gmail_integrations'
     AND grantee = 'anon'
     AND column_name IN ('access_token', 'refresh_token');
  check_name := 'anon_no_token_column_grants';
  ok := (v_count = 0);
  detail := format('anon token-column grant count = %s (expected 0)', v_count);
  RETURN NEXT;

  SELECT COUNT(*) INTO v_count
    FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND table_name = 'gmail_integrations'
     AND grantee = 'authenticated'
     AND column_name = 'access_token'
     AND privilege_type = 'SELECT';
  check_name := 'authenticated_no_select_access_token';
  ok := (v_count = 0);
  detail := format('authenticated SELECT access_token count = %s (expected 0)', v_count);
  RETURN NEXT;

  SELECT COUNT(*) INTO v_count
    FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND table_name = 'gmail_integrations'
     AND grantee = 'authenticated'
     AND column_name = 'refresh_token'
     AND privilege_type = 'SELECT';
  check_name := 'authenticated_no_select_refresh_token';
  ok := (v_count = 0);
  detail := format('authenticated SELECT refresh_token count = %s (expected 0)', v_count);
  RETURN NEXT;

  SELECT COUNT(*) INTO v_count
    FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND table_name = 'gmail_integrations'
     AND grantee = 'authenticated'
     AND column_name IN ('access_token', 'refresh_token')
     AND privilege_type IN ('INSERT', 'UPDATE');
  check_name := 'authenticated_no_write_token_columns';
  ok := (v_count = 0);
  detail := format('authenticated write privs on token columns = %s (expected 0)', v_count);
  RETURN NEXT;

  SELECT COUNT(*) INTO v_count
    FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND table_name = 'gmail_integrations'
     AND grantee = 'authenticated'
     AND column_name = 'email'
     AND privilege_type = 'SELECT';
  check_name := 'authenticated_can_select_email';
  ok := (v_count = 1);
  detail := format('authenticated SELECT email count = %s (expected 1)', v_count);
  RETURN NEXT;

  SELECT COUNT(*) INTO v_count
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'gmail_integrations' AND c.relrowsecurity = true;
  check_name := 'rls_enabled';
  ok := (v_count = 1);
  detail := format('gmail_integrations RLS enabled = %s', v_count = 1);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_gmail_integrations_grants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_gmail_integrations_grants() TO authenticated, service_role;

-- 4. Fail-loud assertion wrapper.
CREATE OR REPLACE FUNCTION public.assert_gmail_integrations_grants()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
  v_failures text := '';
BEGIN
  FOR r IN SELECT * FROM public.audit_gmail_integrations_grants() LOOP
    IF NOT r.ok THEN
      v_failures := v_failures || format(E'\n - %s: %s', r.check_name, r.detail);
    END IF;
  END LOOP;
  IF v_failures <> '' THEN
    RAISE EXCEPTION 'gmail_integrations grant drift detected:%', v_failures;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_gmail_integrations_grants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_gmail_integrations_grants() TO service_role;

-- 5. Run the assertion — this migration fails if hardening is undone.
SELECT public.assert_gmail_integrations_grants();
