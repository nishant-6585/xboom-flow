-- Fix 1: Create admin_whitelist table and server-side validation function
-- This moves the APPROVED_ADMIN_EMAILS from client-side to server-side

CREATE TABLE public.admin_whitelist (
  email TEXT PRIMARY KEY,
  added_by UUID REFERENCES auth.users(id),
  added_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on admin_whitelist
ALTER TABLE public.admin_whitelist ENABLE ROW LEVEL SECURITY;

-- Only admins can view the whitelist
CREATE POLICY "Admins can view admin whitelist"
ON public.admin_whitelist
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND is_user_approved(auth.uid()));

-- Only admins can manage the whitelist
CREATE POLICY "Admins can manage admin whitelist"
ON public.admin_whitelist
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND is_user_approved(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND is_user_approved(auth.uid()));

-- Insert the existing pre-approved admin emails
INSERT INTO public.admin_whitelist (email) VALUES 
  ('vishal.saurav@xboom.in'),
  ('ram@xboom.in');

-- Create server-side function to validate if an email can register as admin
CREATE OR REPLACE FUNCTION public.can_register_as_admin(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_whitelist WHERE email = LOWER(p_email)
  );
END;
$$;

-- Create server-side function to validate admin registration (combines whitelist + count check)
CREATE OR REPLACE FUNCTION public.validate_admin_registration(p_email TEXT)
RETURNS TABLE(allowed BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count INTEGER;
  is_whitelisted BOOLEAN;
BEGIN
  -- Check if email is whitelisted
  SELECT EXISTS (
    SELECT 1 FROM public.admin_whitelist WHERE email = LOWER(p_email)
  ) INTO is_whitelisted;
  
  IF NOT is_whitelisted THEN
    RETURN QUERY SELECT FALSE, 'Only authorized personnel can register as admin. Please request an invitation from an existing admin.';
    RETURN;
  END IF;
  
  -- Check admin count
  SELECT COUNT(*)::INTEGER INTO admin_count
  FROM public.user_roles WHERE role = 'admin';
  
  IF admin_count >= 5 THEN
    RETURN QUERY SELECT FALSE, 'Maximum number of admins (5) has been reached.';
    RETURN;
  END IF;
  
  RETURN QUERY SELECT TRUE, 'Registration allowed';
END;
$$;

-- Fix 2: Make training-pictures bucket private and update policies
UPDATE storage.buckets 
SET public = false 
WHERE id = 'training-pictures';

-- Drop the public access policy
DROP POLICY IF EXISTS "Anyone can view training pictures" ON storage.objects;

-- Create authenticated-only access policy
CREATE POLICY "Authenticated users can view training pictures"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'training-pictures' 
  AND is_user_approved(auth.uid())
);