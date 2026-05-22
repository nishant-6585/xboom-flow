
-- 1. payment_marker_grants table
CREATE TABLE IF NOT EXISTS public.payment_marker_grants (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by  UUID REFERENCES auth.users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  note        TEXT
);

ALTER TABLE public.payment_marker_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage grants" ON public.payment_marker_grants;
CREATE POLICY "Admins manage grants" ON public.payment_marker_grants
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Grant holders see own row" ON public.payment_marker_grants;
CREATE POLICY "Grant holders see own row" ON public.payment_marker_grants
  FOR SELECT TO authenticated USING (user_id = auth.uid());

INSERT INTO public.payment_marker_grants (user_id, note)
VALUES ('ac290dd5-7f28-4930-9a15-52f626e31938', 'Initial supply chain grant for website payment marking')
ON CONFLICT (user_id) DO NOTHING;

-- 2. can_mark_website_payment
CREATE OR REPLACE FUNCTION public.can_mark_website_payment(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
    OR EXISTS (SELECT 1 FROM public.payment_marker_grants WHERE user_id = _user_id);
$$;

REVOKE EXECUTE ON FUNCTION public.can_mark_website_payment(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_mark_website_payment(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_mark_website_payment(uuid) TO authenticated;

-- 3. mark_website_order_paid RPC
CREATE OR REPLACE FUNCTION public.mark_website_order_paid(_woo_order_id text)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _orders_row public.orders%ROWTYPE;
BEGIN
  IF NOT public.can_mark_website_payment(auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied: only admin and granted users can mark website order payments'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.woo_orders
  SET order_status = 'processing',
      updated_at = now()
  WHERE woo_order_id = _woo_order_id
    AND lower(COALESCE(order_status,'')) IN ('pending','on-hold');

  UPDATE public.orders
  SET status = 'payment_received', updated_at = now()
  WHERE external_id = _woo_order_id
    AND source = 'website'
    AND status = 'po_received'
  RETURNING * INTO _orders_row;

  IF _orders_row.id IS NULL THEN
    RAISE EXCEPTION 'order_not_eligible: no internal orders row found for this woo_order_id in po_received state'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN _orders_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_website_order_paid(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_website_order_paid(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_website_order_paid(text) TO authenticated;

-- 4. Catch-up procurement trigger
CREATE OR REPLACE FUNCTION public.trg_create_procurement_on_website_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source <> 'website' THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'payment_received' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_procurements WHERE order_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  PERFORM public._create_procurement_for_order(NEW);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_website_paid_procurement ON public.orders;
CREATE TRIGGER trg_orders_website_paid_procurement
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_create_procurement_on_website_paid();
