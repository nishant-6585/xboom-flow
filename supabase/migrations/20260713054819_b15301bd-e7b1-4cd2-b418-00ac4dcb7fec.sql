
-- Remove broad authenticated read on digilocker feature flags and replace with
-- a SECURITY DEFINER RPC that only returns a boolean visibility signal for the
-- calling user. Prevents portal/b2b customers from reading internal QA emails.

DROP POLICY IF EXISTS feature_flags_authenticated_read_digilocker ON public.feature_flags;

CREATE OR REPLACE FUNCTION public.is_digilocker_kyc_visible()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT lower(coalesce(
      (SELECT email FROM public.portal_contacts WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1),
      (SELECT email FROM auth.users WHERE id = auth.uid())
    )) AS email
  ), g AS (
    SELECT enabled FROM public.feature_flags WHERE key = 'digilocker_kyc_enabled'
  ), t AS (
    SELECT enabled, metadata FROM public.feature_flags WHERE key = 'digilocker_kyc_test_emails'
  )
  SELECT
    auth.uid() IS NOT NULL
    AND (
      COALESCE((SELECT enabled FROM g), false)
      OR EXISTS (
        SELECT 1
        FROM t, jsonb_array_elements_text(COALESCE(t.metadata, '[]'::jsonb)) AS e
        WHERE COALESCE(t.enabled, false) = true
          AND lower(e) = (SELECT email FROM me)
          AND (SELECT email FROM me) IS NOT NULL
      )
    );
$$;

REVOKE ALL ON FUNCTION public.is_digilocker_kyc_visible() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_digilocker_kyc_visible() TO authenticated;
