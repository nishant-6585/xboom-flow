-- Fix the remaining permissive RLS policy for sales_faqs INSERT
DROP POLICY IF EXISTS "Authenticated users can create FAQs" ON public.sales_faqs;

CREATE POLICY "Authenticated users can create FAQs"
ON public.sales_faqs FOR INSERT TO authenticated
WITH CHECK (asked_by = auth.uid());