CREATE OR REPLACE FUNCTION public.get_cron_secret()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v text;
BEGIN
  SELECT decrypted_secret INTO v
  FROM vault.decrypted_secrets
  WHERE name = 'CRON_SECRET'
  LIMIT 1;
  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cron_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_secret() TO service_role;