CREATE OR REPLACE FUNCTION public.get_unified_lead_source_totals()
RETURNS TABLE(source text, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.source::text AS source, count(*)::bigint AS total
  FROM public.unified_lead_feed f
  GROUP BY f.source
  UNION ALL
  SELECT 'manychat'::text, count(*)::bigint FROM public.manychat_leads
$$;

REVOKE ALL ON FUNCTION public.get_unified_lead_source_totals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unified_lead_source_totals() TO authenticated;