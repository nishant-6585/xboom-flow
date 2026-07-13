CREATE OR REPLACE FUNCTION public.clear_false_positive_confirmation_flags(
  p_triggered_by TEXT DEFAULT 'pre_resend_cron'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_run_id UUID;
  v_cleared INT := 0;
  v_skipped INT := 0;
  v_errors INT := 0;
  r RECORD;
  has_drone BOOLEAN;
  item_names JSONB;
  since TIMESTAMPTZ := now() - interval '90 days';
BEGIN
  INSERT INTO public.false_positive_clear_runs (triggered_by)
  VALUES (p_triggered_by)
  RETURNING id INTO v_run_id;

  FOR r IN
    SELECT o.id, o.order_number, o.external_id, o.customer_email, o.customer_name, o.source
    FROM public.orders o
    WHERE o.requires_confirmation = true
      AND coalesce(o.confirmation_status, 'pending') IN ('pending', 'not_sent')
      AND o.deleted_at IS NULL
      AND coalesce(o.status::text, '') <> 'cancelled'
      AND o.created_at >= since
  LOOP
    BEGIN
      SELECT
        bool_or(public.is_drone_product(oi.product_name, oi.product_category)),
        jsonb_agg(jsonb_build_object(
          'product_name', oi.product_name,
          'product_category', oi.product_category,
          'quantity', oi.quantity
        ) ORDER BY oi.created_at)
      INTO has_drone, item_names
      FROM public.order_items oi
      WHERE oi.order_id = r.id;

      IF item_names IS NULL OR has_drone IS TRUE THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      UPDATE public.orders
      SET requires_confirmation = false,
          confirmation_status = 'not_required',
          updated_at = now()
      WHERE id = r.id;

      INSERT INTO public.domain_events (event_type, entity_type, entity_id, payload)
      VALUES (
        'order.confirmation_flag_cleared_false_positive',
        'order',
        r.id,
        jsonb_build_object(
          'order_number', r.order_number,
          'external_id', r.external_id,
          'customer_email', r.customer_email,
          'customer_name', r.customer_name,
          'source', r.source,
          'cleared_by', p_triggered_by,
          'run_id', v_run_id,
          'reason', 'No drone items detected under current is_drone_product rule',
          'triggering_items', item_names
        )
      );

      v_cleared := v_cleared + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  UPDATE public.false_positive_clear_runs
  SET finished_at = now(),
      cleared_count = v_cleared,
      skipped_count = v_skipped,
      error_count = v_errors
  WHERE id = v_run_id;

  RETURN v_run_id;
END;
$function$;