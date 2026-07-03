CREATE OR REPLACE FUNCTION public.confirm_my_order(p_order_id uuid)
RETURNS TABLE (ok boolean, order_id uuid, confirmation_status text, confirmed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_contact public.portal_contacts;
  v_order public.orders;
  v_kyc_status text;
BEGIN
  v_contact := public._current_portal_contact();
  IF v_contact IS NULL OR v_contact.email IS NULL THEN RAISE EXCEPTION 'Not a portal contact'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF v_order.customer_email IS NULL OR lower(v_order.customer_email) <> lower(v_contact.email) THEN
    RAISE EXCEPTION 'Order does not belong to this contact';
  END IF;
  IF v_order.confirmation_status <> 'pending' THEN
    RAISE EXCEPTION 'Order is not pending confirmation';
  END IF;

  -- Enforce KYC submitted (or better) on the portal account before allowing confirmation.
  SELECT kyc_status INTO v_kyc_status
    FROM public.portal_accounts
   WHERE id = v_contact.account_id;
  IF v_kyc_status IS NULL OR v_kyc_status NOT IN ('pending_verification','approved') THEN
    RAISE EXCEPTION 'Please complete your KYC before confirming this order';
  END IF;

  UPDATE public.orders
     SET confirmation_status = 'confirmed', confirmed_at = now(), confirmed_by_contact = v_contact.id
   WHERE id = p_order_id;

  IF v_order.sales_person_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, order_id)
    VALUES (
      v_order.sales_person_id, 'order_confirmed_by_customer',
      'Customer confirmed order ' || COALESCE(v_order.order_number, p_order_id::text),
      COALESCE(v_order.customer_name,'Customer') || ' confirmed order ' ||
        COALESCE(v_order.order_number, p_order_id::text) || ' via the customer portal.',
      p_order_id
    );
  END IF;

  INSERT INTO public.notifications (target_role, type, title, message, order_id)
  VALUES (
    'admin', 'order_confirmed_by_customer',
    'Customer confirmed order ' || COALESCE(v_order.order_number, p_order_id::text),
    COALESCE(v_order.customer_name,'Customer') || ' confirmed order ' ||
      COALESCE(v_order.order_number, p_order_id::text) || '.',
    p_order_id
  );

  RETURN QUERY SELECT true, p_order_id, 'confirmed'::text, now();
END; $$;