
-- Fix lead_tags: restrict to authenticated approved users only
DROP POLICY IF EXISTS "Anyone can view lead tags" ON public.lead_tags;
DROP POLICY IF EXISTS "Public can view lead tags" ON public.lead_tags;
DROP POLICY IF EXISTS "Users can view lead tags" ON public.lead_tags;

CREATE POLICY "Approved users can view lead tags"
ON public.lead_tags
FOR SELECT
TO authenticated
USING (is_user_approved(auth.uid()));

-- Fix enquiry_tags: restrict SELECT to authenticated approved users
DROP POLICY IF EXISTS "Users can view enquiry tags" ON public.enquiry_tags;
DROP POLICY IF EXISTS "Anyone can view enquiry tags" ON public.enquiry_tags;
DROP POLICY IF EXISTS "Authenticated users can view enquiry tags" ON public.enquiry_tags;

CREATE POLICY "Approved users can view enquiry tags"
ON public.enquiry_tags
FOR SELECT
TO authenticated
USING (is_user_approved(auth.uid()));
