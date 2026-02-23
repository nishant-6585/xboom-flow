
-- Fix 1: Restrict meetings table SELECT to approved authenticated users
DROP POLICY IF EXISTS "Users can view all meetings" ON public.meetings;

CREATE POLICY "Approved users can view meetings"
ON public.meetings
FOR SELECT
TO authenticated
USING (is_user_approved(auth.uid()));

-- Fix 2: Make payment-screenshots bucket private
UPDATE storage.buckets SET public = false WHERE id = 'payment-screenshots';

-- Replace the public SELECT policy with authenticated-only
DROP POLICY IF EXISTS "Anyone can view payment screenshots" ON storage.objects;

CREATE POLICY "Approved users can view payment screenshots"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-screenshots' AND
  is_user_approved(auth.uid())
);
