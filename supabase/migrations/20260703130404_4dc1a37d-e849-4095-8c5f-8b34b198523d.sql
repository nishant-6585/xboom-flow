CREATE OR REPLACE FUNCTION public.is_drone_product(p_name text, p_category text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    public.is_drone_category(p_category)
    OR (
      p_name IS NOT NULL
      AND lower(p_name) ~ '(mavic|mini\s*[0-9]|mini\s*pro|phantom|matrice|avata|inspire|fpv|autel\s*evo|skydio|parrot\s*anafi|swellpro|tello|air\s*[0-9]|neo\s*fly|dji\s*neo|agras)'
      AND lower(p_name) !~ '(propeller|battery|charger|filter|cable|controller|gimbal|case|bag|strap|antenna|screen|guard|spare|part|accessor|nd\s*filter|remote|goggle|dock|repair|service)'
    );
$$;

CREATE OR REPLACE FUNCTION public.mark_order_requires_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_drone boolean := false;
  v_pricelist_cat text;
BEGIN
  IF public.is_drone_product(NEW.product_name, NEW.product_category) THEN
    v_is_drone := true;
  ELSE
    SELECT p.product_category INTO v_pricelist_cat
    FROM public.pricelist p
    WHERE lower(p.product_name) = lower(NEW.product_name)
    LIMIT 1;
    IF public.is_drone_product(NEW.product_name, v_pricelist_cat) THEN
      v_is_drone := true;
    END IF;
  END IF;

  IF v_is_drone THEN
    UPDATE public.orders o
       SET requires_confirmation = true,
           confirmation_status = CASE WHEN o.confirmation_status = 'confirmed' THEN 'pending' ELSE 'pending' END
     WHERE o.id = NEW.order_id
       AND o.confirmation_status <> 'confirmed'
       AND (o.requires_confirmation = false OR o.confirmation_status = 'not_required');
  END IF;
  RETURN NEW;
END; $function$;

-- Re-run backfill
UPDATE public.orders o
   SET requires_confirmation = true,
       confirmation_status = 'pending'
 WHERE o.confirmation_status <> 'confirmed'
   AND EXISTS (
     SELECT 1
       FROM public.order_items oi
       LEFT JOIN public.pricelist p
         ON lower(p.product_name) = lower(oi.product_name)
      WHERE oi.order_id = o.id
        AND (
          public.is_drone_product(oi.product_name, oi.product_category)
          OR public.is_drone_product(oi.product_name, p.product_category)
        )
   );