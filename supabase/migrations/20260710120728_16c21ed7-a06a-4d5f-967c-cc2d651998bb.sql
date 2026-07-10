DROP FUNCTION IF EXISTS public.find_duplicate_orders(text, text, text, text, date, numeric);

CREATE OR REPLACE FUNCTION public.find_duplicate_orders(
  p_customer_name text,
  p_customer_phone text,
  p_product_name text,
  p_product_code text,
  p_order_date date,
  p_total numeric
)
RETURNS TABLE(
  id uuid,
  order_number text,
  source text,
  external_id text,
  sales_person_name text,
  total_sales_amount numeric,
  order_date date,
  created_at timestamp with time zone,
  customer_name text,
  customer_phone text,
  product_name text,
  amount_diff_pct numeric,
  days_apart integer,
  match_reasons text[]
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL THEN
    IF NOT public.is_user_approved(v_uid)
       OR NOT (
         public.has_role(v_uid, 'admin')
         OR public.has_role(v_uid, 'sales')
         OR public.has_role(v_uid, 'sales_manager')
         OR public.has_role(v_uid, 'supply_chain')
         OR public.has_role(v_uid, 'finance')
       )
    THEN
      RAISE EXCEPTION 'not permitted' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH input AS (
    SELECT
      NULLIF(regexp_replace(coalesce(p_customer_phone,''), '\D','', 'g'), '') AS phone_digits,
      lower(trim(coalesce(p_customer_name,'')))  AS name_lc,
      lower(trim(coalesce(p_product_name,'')))   AS prod_lc,
      NULLIF(trim(coalesce(p_product_code,'')),'') AS code_norm,
      COALESCE(p_order_date, CURRENT_DATE)       AS odate,
      COALESCE(p_total, 0)::numeric              AS total_in
  )
  SELECT
    o.id, o.order_number, o.source, o.external_id, o.sales_person_name,
    o.total_sales_amount, o.order_date, o.created_at,
    o.customer_name, o.customer_phone, o.product_name,
    CASE WHEN COALESCE(o.total_sales_amount,0) = 0 AND i.total_in = 0
         THEN 0
         WHEN GREATEST(COALESCE(o.total_sales_amount,0), i.total_in) = 0
         THEN 100
         ELSE round(abs(COALESCE(o.total_sales_amount,0) - i.total_in) * 100.0
                    / GREATEST(COALESCE(o.total_sales_amount,0), i.total_in), 2)
    END AS amount_diff_pct,
    abs(coalesce(o.order_date, o.created_at::date) - i.odate)::int AS days_apart,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN i.phone_digits IS NOT NULL
             AND right(regexp_replace(coalesce(o.customer_phone,''),'\D','','g'),10) = right(i.phone_digits,10)
           THEN 'same phone' END,
      CASE WHEN i.name_lc <> '' AND lower(trim(coalesce(o.customer_name,''))) = i.name_lc
           THEN 'same customer name' END,
      CASE WHEN i.code_norm IS NOT NULL AND o.product_code = i.code_norm
           THEN 'same product code' END,
      CASE WHEN i.prod_lc <> ''
             AND similarity(lower(coalesce(o.product_name,'')), i.prod_lc) >= 0.6
           THEN 'similar product' END,
      CASE WHEN abs(coalesce(o.order_date, o.created_at::date) - i.odate) <= 3
           THEN 'same date (±3d)' END
    ], NULL) AS match_reasons
  FROM public.orders o CROSS JOIN input i
  WHERE o.deleted_at IS NULL
    AND COALESCE(o.status::text,'') <> 'cancelled'
    AND coalesce(o.order_date, o.created_at::date) >= (CURRENT_DATE - INTERVAL '90 days')
    AND (
      (i.phone_digits IS NOT NULL
        AND length(i.phone_digits) >= 7
        AND right(regexp_replace(coalesce(o.customer_phone,''),'\D','','g'),10) = right(i.phone_digits,10))
      OR (i.name_lc <> '' AND lower(trim(coalesce(o.customer_name,''))) = i.name_lc)
    )
    AND (
      (i.prod_lc <> '' AND similarity(lower(coalesce(o.product_name,'')), i.prod_lc) >= 0.6)
      OR (i.code_norm IS NOT NULL AND o.product_code = i.code_norm)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.find_duplicate_orders(text, text, text, text, date, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_duplicate_orders(text, text, text, text, date, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_duplicate_orders(text, text, text, text, date, numeric) TO service_role;