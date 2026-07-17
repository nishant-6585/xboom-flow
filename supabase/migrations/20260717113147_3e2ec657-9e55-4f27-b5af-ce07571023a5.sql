CREATE OR REPLACE FUNCTION public.refresh_order_price_from_pricelist(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor        uuid := auth.uid();
  v_order        public.orders%ROWTYPE;
  v_price        numeric;
  v_matched_id   uuid;
  v_matched_name text;
  v_qty          numeric;
  v_discount     numeric;
  v_new_total    numeric;
  v_old_price    numeric;
  v_old_total    numeric;
  v_actor_name   text;
BEGIN
  IF NOT public.can_refresh_order_price(v_actor) THEN
    RAISE EXCEPTION 'Only admin, sales_manager, or granted users can refresh order price from pricelist'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found: %', p_order_id USING ERRCODE = 'P0002';
  END IF;

  SELECT id, COALESCE(website_price, unit_price), product_name
    INTO v_matched_id, v_price, v_matched_name
    FROM public.pricelist
   WHERE (v_order.product_code IS NOT NULL AND woo_sku IS NOT NULL AND woo_sku = v_order.product_code)
   ORDER BY website_synced_at DESC NULLS LAST, updated_at DESC
   LIMIT 1;

  IF v_matched_id IS NULL AND v_order.product_name IS NOT NULL THEN
    SELECT id, COALESCE(website_price, unit_price), product_name
      INTO v_matched_id, v_price, v_matched_name
      FROM public.pricelist
     WHERE lower(product_name) = lower(v_order.product_name)
     ORDER BY website_synced_at DESC NULLS LAST, updated_at DESC
     LIMIT 1;
  END IF;

  IF v_matched_id IS NULL OR v_price IS NULL OR v_price <= 0 THEN
    RETURN jsonb_build_object('skipped', 'no_pricelist_match');
  END IF;

  v_qty       := COALESCE(v_order.quantity, 1);
  v_discount  := COALESCE(v_order.discount_amount, 0);
  v_new_total := GREATEST(0, v_qty * v_price - v_discount);
  v_old_price := v_order.selling_price;
  v_old_total := v_order.total_sales_amount;

  PERFORM set_config('app.price_refresh_bypass', 'on', true);
  UPDATE public.orders
     SET selling_price      = v_price,
         total_sales_amount = v_new_total,
         updated_at         = now()
   WHERE id = p_order_id;
  PERFORM set_config('app.price_refresh_bypass', 'off', true);

  IF v_actor IS NOT NULL THEN
    SELECT name INTO v_actor_name FROM public.profiles WHERE id = v_actor;
    INSERT INTO public.edit_history
      (table_name, record_id, field_name, old_value, new_value, edited_by, edited_by_name)
    VALUES
      ('orders', p_order_id, 'selling_price',
       v_old_price::text, v_price::text, v_actor,
       COALESCE(v_actor_name, 'refresh_order_price_from_pricelist')),
      ('orders', p_order_id, 'total_sales_amount',
       v_old_total::text, v_new_total::text, v_actor,
       COALESCE(v_actor_name, 'refresh_order_price_from_pricelist'));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'matched_pricelist_id', v_matched_id,
    'matched_product_name', v_matched_name,
    'old_selling_price', v_old_price,
    'new_selling_price', v_price,
    'old_total_sales_amount', v_old_total,
    'new_total_sales_amount', v_new_total
  );
END;
$function$;