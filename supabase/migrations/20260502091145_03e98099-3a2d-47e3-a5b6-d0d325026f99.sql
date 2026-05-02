
-- =====================================================
-- 1. Gmail integrations: protect OAuth tokens
-- =====================================================

-- Drop the broad ALL policy
DROP POLICY IF EXISTS "Admin and sales_manager can manage gmail integrations" ON public.gmail_integrations;

-- Sales managers and admins can INSERT
CREATE POLICY "Admin and sales_manager can insert gmail integrations"
ON public.gmail_integrations
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
);

-- Sales managers and admins can UPDATE
CREATE POLICY "Admin and sales_manager can update gmail integrations"
ON public.gmail_integrations
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
);

-- Sales managers and admins can DELETE
CREATE POLICY "Admin and sales_manager can delete gmail integrations"
ON public.gmail_integrations
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
);

-- SELECT allowed for admin and sales_manager (RLS), but column-level privileges
-- below will block sales_manager from reading the secret token columns.
CREATE POLICY "Admin and sales_manager can select gmail integrations"
ON public.gmail_integrations
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
);

-- Column-level privileges: revoke all, then grant only safe columns to authenticated.
-- Service role retains full access (bypasses these grants).
REVOKE ALL ON public.gmail_integrations FROM authenticated;

GRANT SELECT (
  id, user_id, email, token_expiry, last_synced_at, is_active, created_at, updated_at
) ON public.gmail_integrations TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.gmail_integrations TO authenticated;

-- =====================================================
-- 2. Storage: stop public listing of training-uploads
-- =====================================================

-- Remove the anonymous public SELECT policy that allowed listing the whole bucket
DROP POLICY IF EXISTS "Allow public read from training-uploads" ON storage.objects;

-- The remaining policies ("Approved users can view training uploads" and
-- "Authenticated users can view training files") still allow signed-in access.

-- =====================================================
-- 3. Storage: avatars — keep public read (needed for <img> tags), but the bucket
-- is already public so this is intentional. No change required.
-- =====================================================
