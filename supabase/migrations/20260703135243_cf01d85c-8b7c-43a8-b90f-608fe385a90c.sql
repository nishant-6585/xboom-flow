
CREATE OR REPLACE FUNCTION public.submit_delivery_proof(p_order_id uuid, p_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders;
BEGIN
  IF NOT (
       public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'sales_manager'::app_role)
    OR public.has_role(auth.uid(),'sales'::app_role)
    OR public.has_role(auth.uid(),'supply_chain'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_url IS NULL OR length(trim(p_url)) = 0 THEN
    RAISE EXCEPTION 'Proof URL required';
  END IF;

  UPDATE public.orders
     SET delivery_proof_url = p_url,
         delivery_proof_status = 'pending',
         delivery_proof_uploaded_by = auth.uid(),
         delivery_proof_uploaded_at = now(),
         delivery_proof_reviewed_by = NULL,
         delivery_proof_reviewed_at = NULL,
         delivery_proof_reject_reason = NULL,
         delivery_mode = COALESCE(delivery_mode, 'office_pickup')
   WHERE id = p_order_id
   RETURNING * INTO v_order;

  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  INSERT INTO public.notifications (target_role, type, title, message, order_id)
  VALUES
    ('admin','delivery_proof_pending',
     'Delivery proof awaiting review · ' || COALESCE(v_order.order_number, p_order_id::text),
     COALESCE(v_order.sales_person_name,'A staff member') ||
       ' uploaded office-pickup delivery proof for ' ||
       COALESCE(v_order.customer_name,'a customer') || '.',
     p_order_id),
    ('sales_manager','delivery_proof_pending',
     'Delivery proof awaiting review · ' || COALESCE(v_order.order_number, p_order_id::text),
     COALESCE(v_order.sales_person_name,'A staff member') ||
       ' uploaded office-pickup delivery proof for ' ||
       COALESCE(v_order.customer_name,'a customer') || '.',
     p_order_id);
END; $$;

REVOKE ALL ON FUNCTION public.submit_delivery_proof(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_delivery_proof(uuid, text) TO authenticated;
