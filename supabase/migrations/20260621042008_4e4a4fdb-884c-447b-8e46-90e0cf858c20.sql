
-- 1. Restrict KYC reviewer roles to admin and finance only
CREATE OR REPLACE FUNCTION public.is_kyc_reviewer(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid
      AND role IN ('admin','finance')
  );
$function$;

-- 2. Drop overly broad SELECT policy on procurement_payment_requests
DROP POLICY IF EXISTS "Authenticated users can view payment requests" ON public.procurement_payment_requests;

-- Ensure supply_chain can still view (alongside the existing finance policy)
DROP POLICY IF EXISTS "Supply chain can view payment requests" ON public.procurement_payment_requests;
CREATE POLICY "Supply chain can view payment requests"
ON public.procurement_payment_requests
FOR SELECT
USING (
  is_user_approved(auth.uid())
  AND (
    has_role(auth.uid(), 'supply_chain'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- 3. zoho_oauth_states has RLS enabled but no policies — it's accessed only by edge functions via service_role (which bypasses RLS). Add an explicit deny policy for clients to satisfy the linter and make intent explicit.
CREATE POLICY "No client access to oauth states"
ON public.zoho_oauth_states
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);
