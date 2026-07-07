CREATE OR REPLACE FUNCTION public.order_has_drone(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_pricelist_cat text;
  v_item_cat text;
  v_order_name text;
  v_order_code text;
  v_order_cat text;
  v_saw_item boolean := false;
BEGIN
  -- Pass 1: scan order_items (line-item level). This covers ERP orders
  -- created through the "Add items" flow and older manual orders.
  FOR r IN
    SELECT product_name, product_code, product_category
    FROM public.order_items
    WHERE order_id = p_order_id
  LOOP
    v_saw_item := true;
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

    IF public.is_drone_category(v_pricelist_cat) OR public.is_drone_category(v_item_cat) THEN
      RETURN true;
    END IF;

    IF public.is_component_category(v_pricelist_cat) OR public.is_component_category(v_item_cat) THEN
      CONTINUE;
    END IF;

    IF public.is_drone_product(r.product_name, NULL) THEN
      RETURN true;
    END IF;
  END LOOP;

  -- Pass 2: fall back to the order-level product fields (orders.product_name /
  -- product_category / product_code). This covers Woo-imported orders and any
  -- other flow that stores the product on the orders row itself rather than
  -- expanding it into order_items. Without this fallback, those orders were
  -- being incorrectly skipped as "no_drone_in_order".
  SELECT product_name, product_code, product_category
    INTO v_order_name, v_order_code, v_order_cat
  FROM public.orders
  WHERE id = p_order_id;

  IF v_order_name IS NOT NULL OR v_order_cat IS NOT NULL OR v_order_code IS NOT NULL THEN
    v_pricelist_cat := NULL;
    IF v_order_code IS NOT NULL AND btrim(v_order_code) <> '' THEN
      SELECT p.product_category INTO v_pricelist_cat
      FROM public.pricelist p
      WHERE lower(p.woo_sku) = lower(v_order_code)
      LIMIT 1;
    END IF;
    IF v_pricelist_cat IS NULL AND v_order_name IS NOT NULL THEN
      SELECT p.product_category INTO v_pricelist_cat
      FROM public.pricelist p
      WHERE lower(p.product_name) = lower(v_order_name)
      LIMIT 1;
    END IF;

    v_order_cat := NULLIF(btrim(v_order_cat), '');

    IF public.is_drone_category(v_pricelist_cat) OR public.is_drone_category(v_order_cat) THEN
      RETURN true;
    END IF;

    IF public.is_component_category(v_pricelist_cat) OR public.is_component_category(v_order_cat) THEN
      RETURN false;
    END IF;

    IF v_order_name IS NOT NULL AND public.is_drone_product(v_order_name, NULL) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$function$;