CREATE OR REPLACE FUNCTION public.lead_company_coverage()
RETURNS TABLE (
  source text,
  total bigint,
  with_company bigint,
  bad_placeholder bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bad_re text := '^(unknown|n/?a|none|nil|null|-+|test(ing)?|xyz|abc|tbd|xxx|user|customer|client|company|na/na)$';
  phone_re text := '^[0-9 +\-().]+$';
BEGIN
  RETURN QUERY
  WITH src AS (
    SELECT 'Q-Forms'::text AS s, company AS v FROM public.leads
    UNION ALL SELECT 'Forms', company FROM public.form_leads
    UNION ALL SELECT 'Interakt', COALESCE(customer_company, company) FROM public.interakt_leads
    UNION ALL SELECT 'MyOperator', COALESCE(customer_company, company) FROM public.call_logs
    UNION ALL SELECT 'Emails', customer_company FROM public.email_leads
    UNION ALL SELECT 'Google Ads', customer_company FROM public.google_ads_leads
    UNION ALL SELECT 'Enquiries', customer_company FROM public.enquiries
    UNION ALL SELECT 'Prospects', COALESCE(customer_company, company) FROM public.prospects
  ),
  scored AS (
    SELECT 
      s,
      v,
      CASE
        WHEN v IS NULL OR btrim(v) = '' THEN 'empty'
        WHEN length(btrim(v)) < 3 THEN 'bad'
        WHEN lower(btrim(v)) ~ bad_re THEN 'bad'
        WHEN lower(btrim(v)) ~ phone_re THEN 'bad'
        ELSE 'good'
      END AS bucket
    FROM src
  )
  SELECT 
    s,
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE bucket = 'good')::bigint AS with_company,
    COUNT(*) FILTER (WHERE bucket = 'bad')::bigint AS bad_placeholder
  FROM scored
  GROUP BY s
  ORDER BY with_company DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lead_company_coverage() TO authenticated;