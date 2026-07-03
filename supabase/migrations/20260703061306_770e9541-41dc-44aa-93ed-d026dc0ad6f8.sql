
ALTER TABLE public.pricelist   ADD COLUMN IF NOT EXISTS weight_grams numeric;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS weight_grams numeric;

COMMENT ON COLUMN public.pricelist.weight_grams IS
  'Product shipping weight in grams. Synced from WooCommerce (converted from the store weight unit) and editable in the Pricelist UI by admin/supply_chain.';
COMMENT ON COLUMN public.order_items.weight_grams IS
  'Snapshot of the product weight in grams at order-item creation time. Populated from pricelist match or Woo line-item weight.';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS requires_confirmation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmation_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by_contact uuid;

CREATE OR REPLACE FUNCTION public.validate_order_confirmation_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.confirmation_status NOT IN ('not_required','pending','confirmed') THEN
    RAISE EXCEPTION 'Invalid confirmation_status: %', NEW.confirmation_status;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_order_confirmation_status ON public.orders;
CREATE TRIGGER trg_validate_order_confirmation_status
  BEFORE INSERT OR UPDATE OF confirmation_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_order_confirmation_status();

CREATE INDEX IF NOT EXISTS idx_orders_confirmation_pending
  ON public.orders (confirmation_status)
  WHERE confirmation_status = 'pending';

CREATE OR REPLACE FUNCTION public.mark_order_requires_confirmation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.weight_grams IS NOT NULL AND NEW.weight_grams > 249 THEN
    UPDATE public.orders o
       SET requires_confirmation = true,
           confirmation_status = CASE WHEN o.confirmation_status = 'confirmed' THEN 'confirmed' ELSE 'pending' END
     WHERE o.id = NEW.order_id
       AND (o.requires_confirmation = false OR o.confirmation_status = 'not_required');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_mark_order_requires_confirmation ON public.order_items;
CREATE TRIGGER trg_mark_order_requires_confirmation
  AFTER INSERT OR UPDATE OF weight_grams ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.mark_order_requires_confirmation();

CREATE OR REPLACE FUNCTION public._current_portal_contact()
RETURNS public.portal_contacts LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pc.* FROM public.portal_contacts pc
   WHERE pc.auth_user_id = auth.uid() AND pc.is_active = true LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_my_confirmable_orders()
RETURNS TABLE (
  order_id uuid, order_number text, order_date date, product_name text,
  total_sales_amount numeric, confirmation_status text, confirmed_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_contact public.portal_contacts;
BEGIN
  v_contact := public._current_portal_contact();
  IF v_contact IS NULL OR v_contact.email IS NULL OR length(trim(v_contact.email)) = 0 THEN RETURN; END IF;
  RETURN QUERY
  SELECT o.id, o.order_number, o.order_date, o.product_name,
         o.total_sales_amount, o.confirmation_status, o.confirmed_at
    FROM public.orders o
   WHERE o.confirmation_status = 'pending'
     AND o.customer_email IS NOT NULL
     AND lower(o.customer_email) = lower(v_contact.email)
   ORDER BY o.order_date DESC NULLS LAST, o.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.confirm_my_order(p_order_id uuid)
RETURNS TABLE (ok boolean, order_id uuid, confirmation_status text, confirmed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_contact public.portal_contacts; v_order public.orders;
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

REVOKE ALL ON FUNCTION public._current_portal_contact()       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_confirmable_orders()     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_my_order(uuid)          FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_confirmable_orders()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_my_order(uuid)       TO authenticated;

INSERT INTO public.notification_templates (event_type, provider, template_id, language, variables, is_active)
SELECT 'confirmation_request','msg91','PLACEHOLDER_FILL_IN_MSG91_TEMPLATE_ID','en',
       '["customer_name","order_number","link"]'::jsonb, false
 WHERE NOT EXISTS (
   SELECT 1 FROM public.notification_templates
    WHERE event_type='confirmation_request' AND provider='msg91'
 );
