-- Fix 1: Restrict meetings table SELECT to owners, participants, and admins
-- Note: participants is TEXT[] so we cast auth.uid() to text for comparison
DROP POLICY IF EXISTS "Users can view all meetings" ON public.meetings;

CREATE POLICY "Users can view own meetings"
ON public.meetings
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid() 
  OR host_id = auth.uid()
  OR auth.uid()::text = ANY(participants)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Fix 2: Make payment-screenshots bucket private and restrict access
UPDATE storage.buckets 
SET public = false 
WHERE id = 'payment-screenshots';

-- Drop the public access policy
DROP POLICY IF EXISTS "Anyone can view payment screenshots" ON storage.objects;

-- Create role-based access policy for payment screenshots (admin and finance)
CREATE POLICY "Admin and Finance can view payment screenshots"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-screenshots'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
  )
  AND is_user_approved(auth.uid())
);