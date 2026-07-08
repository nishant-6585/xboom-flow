CREATE POLICY "feature_flags_authenticated_read_digilocker"
ON public.feature_flags
FOR SELECT
TO authenticated
USING (key IN ('digilocker_kyc_enabled', 'digilocker_kyc_test_emails'));