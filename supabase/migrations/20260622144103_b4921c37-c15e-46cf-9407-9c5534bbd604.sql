-- find_claimable_website_order: lookup by exact order_number or customer phone/email
-- returns minimal MASKED summary, only if order is website + paid (mirrored) + unattributed.
CREATE OR REPLACE FUNCTION public.find_claimable_website_order(p_query text)
RETURNS TABLE (
  order_id uuid,
  order_number text,
  order_date timestamptz,
  product_name text,
  total numeric,
  customer_name_masked text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
  v_q text;
  v_digits text;
BEGIN
  -- AuthZ: sales / sales_manager / admin only
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
    OR public.has_role(auth.uid(), 'sales')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_q := btrim(coalesce(p_query, ''));
  IF length(v_q) < 3 THEN
    RETURN; -- guard against fishing with empty/tiny strings
  END IF;
  v_digits := regexp_replace(v_q, '\D', '', 'g');

  RETURN QUERY
  SELECT
    o.id AS order_id,
    o.order_number,
    o.order_date,
    o.product_name,
    o.total_sales_amount AS total,
    CASE
      WHEN o.customer_name IS NULL OR length(o.customer_name) = 0 THEN '—'
      WHEN length(o.customer_name) <= 2 THEN left(o.customer_name, 1) || '•'
      ELSE left(o.customer_name, 2) || repeat('•', greatest(length(o.customer_name) - 3, 1)) || right(o.customer_name, 1)
    END AS customer_name_masked
  FROM public.orders o
  WHERE o.source = 'website'
    AND COALESCE(o.sales_attribution_locked, false) = false
    AND o.sales_person_id = 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid
    AND (
      o.order_number = v_q
      OR (length(v_digits) >= 7 AND regexp_replace(coalesce(o.customer_phone,''), '\D', '', 'g') LIKE '%' || v_digits || '%')
      OR (position('@' in v_q) > 0 AND lower(coalesce(o.customer_email,'')) = lower(v_q))
    )
  ORDER BY o.order_date DESC NULLS LAST
  LIMIT 5;
END;
$$;

REVOKE ALL ON FUNCTION public.find_claimable_website_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_claimable_website_order(text) TO authenticated;