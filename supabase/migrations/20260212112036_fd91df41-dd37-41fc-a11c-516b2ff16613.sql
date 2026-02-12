
-- Fix: Form Creator Information Exposed to Public
-- Create a public view that excludes sensitive columns (created_by, created_by_name)
CREATE OR REPLACE VIEW public.forms_public AS 
SELECT id, name, description, is_active 
FROM public.forms 
WHERE is_active = true;

-- Grant access to the view for public embed usage
GRANT SELECT ON public.forms_public TO anon;
GRANT SELECT ON public.forms_public TO authenticated;

-- Drop the overly permissive public policy on the base table
DROP POLICY IF EXISTS "Public can view active forms" ON public.forms;
