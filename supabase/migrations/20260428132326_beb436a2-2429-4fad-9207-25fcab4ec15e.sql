CREATE OR REPLACE FUNCTION public.update_woo_lead_status(
  p_order_id uuid,
  p_new_status text
) RETURNS public.woocommerce_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_old text;
  v_woo_order_id text;
  v_row public.woocommerce_orders;
  v_user_name text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_new_status NOT IN ('pending','on-hold','failed','cancelled','refunded') THEN
    RAISE EXCEPTION 'Invalid lead status: %', p_new_status USING ERRCODE = '22023';
  END IF;

  SELECT order_status, woo_order_id
    INTO v_old, v_woo_order_id
  FROM public.woocommerce_orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.woocommerce_orders
     SET order_status = p_new_status,
         updated_at   = now()
   WHERE id = p_order_id
   RETURNING * INTO v_row;

  IF v_old IS DISTINCT FROM p_new_status AND v_woo_order_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(raw_user_meta_data->>'full_name',''), email, 'Team member')
      INTO v_user_name
    FROM auth.users WHERE id = v_user;

    INSERT INTO public.woo_lead_activities (
      woo_order_id, activity_type, description,
      performed_by, performed_by_name, metadata
    ) VALUES (
      v_woo_order_id,
      'status_change',
      format('Status changed: %s → %s',
             COALESCE(v_old,'unknown'), p_new_status),
      v_user,
      COALESCE(v_user_name,'Team member'),
      jsonb_build_object('from', v_old, 'to', p_new_status)
    );
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_woo_lead_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_woo_lead_status(uuid, text) TO authenticated;