-- 1. ManyChat leads: scope sales reps to their own assigned leads
DROP POLICY IF EXISTS "Authorized roles can view manychat leads" ON public.manychat_leads;
CREATE POLICY "Manychat leads visibility"
ON public.manychat_leads
FOR SELECT
TO authenticated
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR (has_role(auth.uid(), 'sales'::app_role) AND assigned_to = auth.uid())
  )
);

-- 2. Abandoned carts: let the approved sales team see them (unassigned lead pool)
DROP POLICY IF EXISTS "Admins can view archived carts" ON public.abandoned_carts_archive;
CREATE POLICY "Sales team can view archived carts"
ON public.abandoned_carts_archive
FOR SELECT
TO authenticated
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR has_role(auth.uid(), 'sales'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
  )
);
GRANT SELECT ON public.abandoned_carts_archive TO authenticated;

-- 3. Channel totals must reflect the caller's own visibility
CREATE OR REPLACE FUNCTION public.get_unified_lead_source_totals()
RETURNS TABLE(source text, total bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT f.source::text AS source, count(*)::bigint AS total
  FROM public.unified_lead_feed f
  GROUP BY f.source
$function$;