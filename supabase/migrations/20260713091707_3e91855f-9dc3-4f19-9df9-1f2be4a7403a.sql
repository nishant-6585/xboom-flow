
ALTER TABLE public.sales_attribution_log DROP CONSTRAINT IF EXISTS sales_attribution_log_source_check;
ALTER TABLE public.sales_attribution_log
  ADD CONSTRAINT sales_attribution_log_source_check
  CHECK (source = ANY (ARRAY['direct'::text, 'approved_request'::text, 'reconcile'::text]));

-- Guard trigger --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_website_order_sales_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag text;
BEGIN
  IF OLD.source <> 'website' THEN
    RETURN NEW;
  END IF;

  IF NEW.sales_person_id IS DISTINCT FROM OLD.sales_person_id
     OR NEW.sales_person_name IS DISTINCT FROM OLD.sales_person_name THEN
    BEGIN
      v_flag := current_setting('app.attribution_rpc', true);
    EXCEPTION WHEN OTHERS THEN
      v_flag := NULL;
    END;

    IF v_flag IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION
        'Sales attribution on website orders must go through attribute_website_order / request_website_order_attribution (order %).',
        OLD.order_number
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_website_order_sales_attribution ON public.orders;
CREATE TRIGGER trg_guard_website_order_sales_attribution
  BEFORE UPDATE OF sales_person_id, sales_person_name ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_website_order_sales_attribution();

-- Update core RPC to set the GUC so its own UPDATE bypasses the guard --
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
  IF p_source NOT IN ('direct','approved_request','reconcile') THEN
    RAISE EXCEPTION 'invalid source: %', p_source;
  END IF;

  PERFORM set_config('app.attribution_rpc', 'on', true);

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
    order_id, from_sales_person_id, to_sales_person_id, to_sales_person_name,
    changed_by, changed_by_name, source, reason, reason_custom
  ) VALUES (
    p_order_id, v_from_id, p_sales_person_id, v_rep_name,
    p_actor_id, p_actor_name, p_source, p_reason, p_reason_custom
  );
END;
$function$;

-- Backfill: reconcile any website-source orders that were direct-edited before the guard existed
DO $$
DECLARE
  r RECORD;
  v_last_editor_id uuid;
  v_last_editor_name text;
  v_actor_id uuid;
  v_actor_name text;
BEGIN
  FOR r IN
    SELECT o.id, o.order_number, o.sales_person_id
      FROM public.orders o
     WHERE o.source = 'website'
       AND o.sales_person_id IS NOT NULL
       AND o.attributed_at IS NULL
  LOOP
    SELECT eh.edited_by, eh.edited_by_name
      INTO v_last_editor_id, v_last_editor_name
      FROM public.edit_history eh
     WHERE eh.record_id = r.id
       AND eh.table_name = 'orders'
       AND eh.field_name IN ('sales_person_id','sales_person_name')
     ORDER BY eh.edited_at DESC
     LIMIT 1;

    v_actor_id   := COALESCE(v_last_editor_id, r.sales_person_id);
    v_actor_name := COALESCE(v_last_editor_name, 'System Reconcile');

    PERFORM public._attribute_website_order_core(
      r.id,
      r.sales_person_id,
      'system_reconcile',
      'Backfilled attribution metadata for website order that was direct-edited before guard trigger',
      'reconcile',
      v_actor_id,
      v_actor_name
    );
  END LOOP;
END $$;
