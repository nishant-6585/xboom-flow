
-- Signals a "component/accessory/spare" category so we can definitively say
-- an item is NOT a drone, even if its name mentions a drone model.
CREATE OR REPLACE FUNCTION public.is_component_category(cat text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT cat IS NOT NULL
     AND lower(cat) ~ '(component|accessor|part|spare|batter|propeller|repair|service|payload|software|charging|hub|dock|gimbal|filter|cable|controller|charger|remote|goggle|case|bag|strap|antenna|screen|guard|parachute|show|mount|motor|frame|esc|vtx|stack)';
$$;

-- Rewrite order_has_drone with the 3-tier signal.
CREATE OR REPLACE FUNCTION public.order_has_drone(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_pricelist_cat text;
  v_item_cat text;
  v_cat text;
BEGIN
  FOR r IN
    SELECT product_name, product_code, product_category
    FROM public.order_items
    WHERE order_id = p_order_id
  LOOP
    v_pricelist_cat := NULL;

    IF r.product_code IS NOT NULL AND btrim(r.product_code) <> '' THEN
      SELECT p.product_category INTO v_pricelist_cat
      FROM public.pricelist p
      WHERE lower(p.woo_sku) = lower(r.product_code)
      LIMIT 1;
    END IF;
    IF v_pricelist_cat IS NULL THEN
      SELECT p.product_category INTO v_pricelist_cat
      FROM public.pricelist p
      WHERE lower(p.product_name) = lower(r.product_name)
      LIMIT 1;
    END IF;

    v_item_cat := NULLIF(btrim(r.product_category), '');

    -- Tier 1: any category clearly says "drone" → drone.
    IF public.is_drone_category(v_pricelist_cat) OR public.is_drone_category(v_item_cat) THEN
      RETURN true;
    END IF;

    -- Tier 2: any category clearly says "component/part" → this item is not a drone.
    IF public.is_component_category(v_pricelist_cat) OR public.is_component_category(v_item_cat) THEN
      CONTINUE;
    END IF;

    -- Tier 3: no category was conclusive → name rule.
    IF public.is_drone_product(r.product_name, NULL) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

-- Same 3-tier logic in the trigger.
CREATE OR REPLACE FUNCTION public.mark_order_requires_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pricelist_cat text := NULL;
  v_item_cat text;
  v_is_drone boolean := false;
BEGIN
  IF NEW.product_code IS NOT NULL AND btrim(NEW.product_code) <> '' THEN
    SELECT p.product_category INTO v_pricelist_cat
    FROM public.pricelist p
    WHERE lower(p.woo_sku) = lower(NEW.product_code)
    LIMIT 1;
  END IF;
  IF v_pricelist_cat IS NULL THEN
    SELECT p.product_category INTO v_pricelist_cat
    FROM public.pricelist p
    WHERE lower(p.product_name) = lower(NEW.product_name)
    LIMIT 1;
  END IF;

  v_item_cat := NULLIF(btrim(NEW.product_category), '');

  IF public.is_drone_category(v_pricelist_cat) OR public.is_drone_category(v_item_cat) THEN
    v_is_drone := true;
  ELSIF public.is_component_category(v_pricelist_cat) OR public.is_component_category(v_item_cat) THEN
    v_is_drone := false;
  ELSE
    v_is_drone := public.is_drone_product(NEW.product_name, NULL);
  END IF;

  IF v_is_drone THEN
    UPDATE public.orders o
       SET requires_confirmation = true,
           confirmation_status = 'pending'
     WHERE o.id = NEW.order_id
       AND o.confirmation_status <> 'confirmed'
       AND (o.requires_confirmation = false OR o.confirmation_status = 'not_required');
  END IF;

  RETURN NEW;
END;
$$;
