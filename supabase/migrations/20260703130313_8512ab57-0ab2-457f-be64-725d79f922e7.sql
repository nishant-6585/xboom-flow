-- 1) Shared drone category detection
CREATE OR REPLACE FUNCTION public.is_drone_category(cat text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN cat IS NULL THEN false
    WHEN lower(cat) !~ 'drone' THEN false
    WHEN lower(cat) ~ '(component|accessor|part|spare|batter|propeller|repair|service|show|payload|software|guide|parachute|filter|cable|controller|charging|hub|dock|gimbal|nd\s*filter)' THEN false
    ELSE true
  END;
$$;

-- Also treat canonical drone-brand/type categories that don't contain the word "drone"
-- (e.g. "DJI", "Autel", "SwellPro") as NOT auto-drone — brand categories can include
-- accessories. We rely on the word "drone" appearing in the category name. Callers can
-- supplement by product-name detection.

-- 2) Rewrite trigger to use helper AND fall back to pricelist lookup by product name
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
  -- Direct category on the order item
  IF public.is_drone_category(NEW.product_category) THEN
    v_is_drone := true;
  ELSE
    -- Fallback: look up pricelist by product name and test its category
    SELECT p.product_category INTO v_pricelist_cat
    FROM public.pricelist p
    WHERE lower(p.product_name) = lower(NEW.product_name)
    LIMIT 1;
    IF public.is_drone_category(v_pricelist_cat) THEN
      v_is_drone := true;
    END IF;
  END IF;

  IF v_is_drone THEN
    UPDATE public.orders o
       SET requires_confirmation = true,
           confirmation_status = CASE WHEN o.confirmation_status = 'confirmed' THEN 'confirmed' ELSE 'pending' END
     WHERE o.id = NEW.order_id
       AND (o.requires_confirmation = false OR o.confirmation_status = 'not_required');
  END IF;
  RETURN NEW;
END; $function$;

-- 3) One-time re-evaluation: flip non-confirmed orders that have a drone item
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
          public.is_drone_category(oi.product_category)
          OR public.is_drone_category(p.product_category)
        )
   );