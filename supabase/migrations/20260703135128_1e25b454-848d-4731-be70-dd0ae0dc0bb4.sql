
-- Stage 2: delivery proof for office/showroom pickup + portal My Purchases RPC

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_mode text,
  ADD COLUMN IF NOT EXISTS delivery_proof_url text,
  ADD COLUMN IF NOT EXISTS delivery_proof_status text,
  ADD COLUMN IF NOT EXISTS delivery_proof_uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS delivery_proof_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_proof_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS delivery_proof_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_proof_reject_reason text;

CREATE OR REPLACE FUNCTION public.validate_order_delivery_proof()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.delivery_mode IS NOT NULL AND NEW.delivery_mode NOT IN ('courier','office_pickup') THEN
    RAISE EXCEPTION 'Invalid delivery_mode: %', NEW.delivery_mode;
  END IF;
  IF NEW.delivery_proof_status IS NOT NULL
     AND NEW.delivery_proof_status NOT IN ('pending','approved','rejected') THEN
    RAISE EXCEPTION 'Invalid delivery_proof_status: %', NEW.delivery_proof_status;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_order_delivery_proof ON public.orders;
CREATE TRIGGER trg_validate_order_delivery_proof
  BEFORE INSERT OR UPDATE OF delivery_mode, delivery_proof_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_order_delivery_proof();

CREATE INDEX IF NOT EXISTS idx_orders_delivery_proof_pending
  ON public.orders (delivery_proof_status)
  WHERE delivery_proof_status = 'pending';

-- My Purchases RPC (portal contact -> email-matched orders)
CREATE OR REPLACE FUNCTION public.get_my_purchases()
RETURNS TABLE (
  order_id uuid,
  order_number text,
  order_date date,
  product_name text,
  quantity integer,
  total_sales_amount numeric,
  status text,
  confirmation_status text,
  tracking_number text,
  tracking_url text,
  courier_name text,
  actual_delivery date
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_contact public.portal_contacts;
BEGIN
  v_contact := public._current_portal_contact();
  IF v_contact IS NULL OR v_contact.email IS NULL OR length(trim(v_contact.email)) = 0 THEN RETURN; END IF;
  RETURN QUERY
  SELECT o.id, o.order_number, o.order_date, o.product_name, o.quantity,
         o.total_sales_amount, o.status::text, o.confirmation_status,
         o.tracking_number, o.tracking_url, o.courier_name, o.actual_delivery
    FROM public.orders o
   WHERE o.customer_email IS NOT NULL
     AND lower(o.customer_email) = lower(v_contact.email)
   ORDER BY o.order_date DESC NULLS LAST, o.created_at DESC;
END; $$;

REVOKE ALL ON FUNCTION public.get_my_purchases() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_purchases() TO authenticated;

-- Staff proof approve / reject
CREATE OR REPLACE FUNCTION public.approve_delivery_proof(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role)
       OR public.has_role(auth.uid(),'sales_manager'::app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.orders
     SET delivery_proof_status = 'approved',
         delivery_proof_reviewed_by = auth.uid(),
         delivery_proof_reviewed_at = now(),
         delivery_proof_reject_reason = NULL
   WHERE id = p_order_id AND delivery_proof_status = 'pending';
END; $$;

CREATE OR REPLACE FUNCTION public.reject_delivery_proof(p_order_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role)
       OR public.has_role(auth.uid(),'sales_manager'::app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Rejection reason required';
  END IF;
  UPDATE public.orders
     SET delivery_proof_status = 'rejected',
         delivery_proof_reviewed_by = auth.uid(),
         delivery_proof_reviewed_at = now(),
         delivery_proof_reject_reason = p_reason
   WHERE id = p_order_id AND delivery_proof_status = 'pending';
END; $$;

REVOKE ALL ON FUNCTION public.approve_delivery_proof(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_delivery_proof(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_delivery_proof(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_delivery_proof(uuid, text) TO authenticated;

-- Storage RLS for delivery-proofs bucket (bucket itself created via tool)
-- Staff upload; admin/sales_manager + uploader can read
CREATE POLICY "Delivery proofs: staff upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'delivery-proofs'
    AND (
      public.has_role(auth.uid(),'admin'::app_role)
      OR public.has_role(auth.uid(),'sales_manager'::app_role)
      OR public.has_role(auth.uid(),'sales'::app_role)
      OR public.has_role(auth.uid(),'supply_chain'::app_role)
    )
  );

CREATE POLICY "Delivery proofs: reviewer & uploader read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'delivery-proofs'
    AND (
      public.has_role(auth.uid(),'admin'::app_role)
      OR public.has_role(auth.uid(),'sales_manager'::app_role)
      OR owner = auth.uid()
    )
  );

CREATE POLICY "Delivery proofs: uploader delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'delivery-proofs'
    AND (
      public.has_role(auth.uid(),'admin'::app_role)
      OR owner = auth.uid()
    )
  );
