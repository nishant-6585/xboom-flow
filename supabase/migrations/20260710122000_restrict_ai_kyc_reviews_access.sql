DROP POLICY IF EXISTS "Staff can view AI KYC reviews" ON public.ai_kyc_reviews;

CREATE POLICY "KYC reviewers can view AI KYC reviews"
ON public.ai_kyc_reviews
FOR SELECT
TO authenticated
USING (public.is_kyc_reviewer(auth.uid()));
