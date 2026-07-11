CREATE OR REPLACE FUNCTION public._attribute_website_order_core(p_order_id uuid, p_sales_person_id uuid, p_reason text, p_reason_custom text, p_source text, p_actor_id uuid, p_actor_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from_id uuid;
  v_rep_name text;
  v_order_number text;
  v_total numeric;
BEGIN
  IF p_source NOT IN ('direct','approved_request') THEN
    RAISE EXCEPTION 'invalid source: %', p_source;
  END IF;

  SELECT sales_person_id, COALESCE(order_number, id::text), COALESCE(total_sales_amount, 0)
    INTO v_from_id, v_order_number, v_total
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  SELECT COALESCE(name, email, 'Unknown') INTO v_rep_name
    FROM public.profiles WHERE user_id = p_sales_person_id;

  UPDATE public.orders
     SET sales_person_id = p_sales_person_id,
         sales_person_name = COALESCE(v_rep_name, sales_person_name),
         sales_attribution_locked = true,
         sales_attribution_reason = p_reason,
         sales_attribution_reason_custom = p_reason_custom,
         attributed_by = p_actor_id,
         attributed_by_name = p_actor_name,
         attributed_at = now(),
         source = 'manual',
         lead_source = COALESCE(lead_source, 'website'),
         updated_at = now()
   WHERE id = p_order_id;

  -- Reset points for this order to avoid double-counting (idempotent)
  DELETE FROM public.sales_points
   WHERE reference_id = p_order_id
     AND category IN ('order_created','order_value');

  INSERT INTO public.sales_points (user_id, points, category, description, reference_id)
  VALUES (p_sales_person_id, 10, 'order_created',
          'Points for creating order ' || v_order_number, p_order_id);

  IF v_total > 0 THEN
    INSERT INTO public.sales_points (user_id, points, category, description, reference_id)
    VALUES (p_sales_person_id, LEAST(500, GREATEST(1, floor(v_total / 1000)::int)),
            'order_value',
            'Points for order value ' || v_total, p_order_id);
  END IF;

  INSERT INTO public.sales_attribution_log (
    order_id, from_user_id, to_user_id, actor_id, actor_name,
    source, reason, reason_custom
  ) VALUES (
    p_order_id, v_from_id, p_sales_person_id, p_actor_id, p_actor_name,
    p_source, p_reason, p_reason_custom
  );
END;
$function$;

-- Backfill: historical attributions predate the source flip.
UPDATE public.orders
   SET source = 'manual',
       lead_source = COALESCE(lead_source, 'website')
 WHERE source = 'website'
   AND sales_attribution_locked = true;