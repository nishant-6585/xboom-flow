-- 1) Pin search_path on allowed_website_lead_assignees (SUPA_function_search_path_mutable)
ALTER FUNCTION public.allowed_website_lead_assignees() SET search_path = public;

-- 2) Remove direct client SELECT policy on gmail_integrations. Clients must go
-- through public.get_gmail_integrations_safe() which excludes token columns.
DROP POLICY IF EXISTS "Owners can select their gmail integrations" ON public.gmail_integrations;