-- Tighten feature_flags SELECT to admins only.
DROP POLICY IF EXISTS feature_flags_read_auth ON public.feature_flags;
CREATE POLICY feature_flags_admin_read
  ON public.feature_flags
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));