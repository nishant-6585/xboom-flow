
-- 1) Runs table for the pre-cron cleaner
CREATE TABLE IF NOT EXISTS public.false_positive_clear_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  cleared_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  triggered_by TEXT NOT NULL DEFAULT 'pre_resend_cron',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.false_positive_clear_runs TO authenticated;
GRANT ALL ON public.false_positive_clear_runs TO service_role;

ALTER TABLE public.false_positive_clear_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view fp clear runs" ON public.false_positive_clear_runs;
CREATE POLICY "Admins view fp clear runs"
  ON public.false_positive_clear_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_fp_clear_runs_started_at
  ON public.false_positive_clear_runs (started_at DESC);

-- 2) Rewrite the cleaner to record a run + skip/error counts and return run_id
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
      AND coalesce(o.status, '') <> 'cancelled'
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

REVOKE ALL ON FUNCTION public.clear_false_positive_confirmation_flags(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_false_positive_confirmation_flags(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_false_positive_confirmation_flags(TEXT) TO authenticated;

-- 3) Manual per-order clear (admin only)
CREATE OR REPLACE FUNCTION public.clear_order_confirmation_flag_manual(
  p_order_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_name TEXT;
  r RECORD;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT id, order_number, external_id, customer_email, customer_name, source,
         requires_confirmation, confirmation_status
  INTO r
  FROM public.orders
  WHERE id = p_order_id;

  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF r.requires_confirmation IS NOT TRUE THEN
    RAISE EXCEPTION 'Order does not require confirmation';
  END IF;

  SELECT COALESCE(full_name, email) INTO v_name FROM public.profiles WHERE id = v_actor;

  UPDATE public.orders
  SET requires_confirmation = false,
      confirmation_status = 'not_required',
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.domain_events (event_type, entity_type, entity_id, payload)
  VALUES (
    'order.confirmation_flag_cleared_false_positive',
    'order',
    p_order_id,
    jsonb_build_object(
      'order_number', r.order_number,
      'external_id', r.external_id,
      'customer_email', r.customer_email,
      'customer_name', r.customer_name,
      'source', r.source,
      'cleared_by', 'manual_admin',
      'cleared_by_user_id', v_actor,
      'cleared_by_name', v_name,
      'previous_confirmation_status', COALESCE(r.confirmation_status, 'pending'),
      'reason', p_reason
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.clear_order_confirmation_flag_manual(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_order_confirmation_flag_manual(UUID, TEXT) TO authenticated;

-- 4) Bulk pricelist category update with edit_history audit
CREATE OR REPLACE FUNCTION public.update_pricelist_categories_bulk(
  p_items JSONB,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(updated INT, unchanged INT, missing INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_name TEXT;
  it JSONB;
  v_id UUID;
  v_new TEXT;
  v_old TEXT;
  v_updated INT := 0;
  v_unchanged INT := 0;
  v_missing INT := 0;
BEGIN
  IF v_actor IS NULL OR NOT (
    public.has_role(v_actor, 'admin') OR public.has_role(v_actor, 'supply_chain')
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items must be a JSON array';
  END IF;

  SELECT COALESCE(full_name, email) INTO v_name FROM public.profiles WHERE id = v_actor;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_id := NULLIF(it->>'id','')::UUID;
    v_new := NULLIF(btrim(it->>'product_category'),'');
    IF v_id IS NULL OR v_new IS NULL THEN
      v_missing := v_missing + 1;
      CONTINUE;
    END IF;

    SELECT product_category INTO v_old FROM public.pricelist WHERE id = v_id;
    IF NOT FOUND THEN
      v_missing := v_missing + 1;
      CONTINUE;
    END IF;
    IF v_old IS NOT DISTINCT FROM v_new THEN
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;

    UPDATE public.pricelist
    SET product_category = v_new,
        updated_by = v_actor,
        updated_at = now()
    WHERE id = v_id;

    INSERT INTO public.edit_history (
      table_name, record_id, field_name, old_value, new_value, edited_by, edited_by_name
    ) VALUES (
      'pricelist', v_id, 'product_category',
      v_old, v_new, v_actor, COALESCE(v_name, 'admin')
    );

    IF p_reason IS NOT NULL AND length(btrim(p_reason)) > 0 THEN
      INSERT INTO public.edit_history (
        table_name, record_id, field_name, old_value, new_value, edited_by, edited_by_name
      ) VALUES (
        'pricelist', v_id, 'product_category_change_reason',
        NULL, p_reason, v_actor, COALESCE(v_name, 'admin')
      );
    END IF;

    v_updated := v_updated + 1;
  END LOOP;

  updated := v_updated;
  unchanged := v_unchanged;
  missing := v_missing;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_pricelist_categories_bulk(JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_pricelist_categories_bulk(JSONB, TEXT) TO authenticated;
