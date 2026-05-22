
-- =====================================================================
-- 1. Refactor procurement auto-creation: extract helper, guard on insert,
--    add UPDATE trigger for website orders transitioning to payment_received.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._create_procurement_for_order(_order public.orders)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.inventory_procurements (
    product_name,
    product_category,
    product_code,
    quantity,
    supplier_id,
    supplier_name,
    payment_status,
    procurement_date,
    order_id,
    created_by
  ) VALUES (
    _order.product_name,
    COALESCE(_order.product_category, 'Consumer Drones'),
    _order.product_code,
    _order.quantity,
    _order.supplier_id,
    _order.supplier_name,
    'pending',
    COALESCE(_order.procurement_date, CURRENT_DATE)::date,
    _order.id,
    _order.created_by
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_create_procurement_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip auto-procurement for unpaid / cancelled website orders.
  IF NEW.source = 'website' AND NEW.status IN ('po_received', 'cancelled') THEN
    RETURN NEW;
  END IF;

  PERFORM public._create_procurement_for_order(NEW);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_create_procurement_on_website_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source <> 'website' THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'payment_received' THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.inventory_procurements WHERE order_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  PERFORM public._create_procurement_for_order(NEW);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_website_paid_procurement ON public.orders;
CREATE TRIGGER trg_orders_website_paid_procurement
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_create_procurement_on_website_paid();

-- =====================================================================
-- 2. payment_marker_grants table + capability function + seed Sanu Sabu.
-- =====================================================================

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
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.can_mark_website_payment(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR EXISTS (SELECT 1 FROM public.payment_marker_grants WHERE user_id = _user_id);
$$;

GRANT EXECUTE ON FUNCTION public.can_mark_website_payment(uuid) TO authenticated;

-- Seed Sanu Sabu
INSERT INTO public.payment_marker_grants (user_id, note)
VALUES ('ac290dd5-7f28-4930-9a15-52f626e31938', 'Initial supply chain grant for website payment marking')
ON CONFLICT (user_id) DO NOTHING;

-- =====================================================================
-- 3. RPCs: mark_website_order_paid and cancel_website_order
-- =====================================================================

CREATE OR REPLACE FUNCTION public.mark_website_order_paid(_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.orders%ROWTYPE;
BEGIN
  IF NOT public.can_mark_website_payment(auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied: only admin and granted users can mark website order payments'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.orders
  SET status = 'payment_received', updated_at = now()
  WHERE id = _order_id
    AND source = 'website'
    AND status = 'po_received'
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'order_not_eligible: order not found, not website-sourced, or not in pending payment state'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_website_order_paid(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_website_order(_order_id uuid, _reason text DEFAULT NULL)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.orders%ROWTYPE;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finance')
    OR public.has_role(auth.uid(), 'supply_chain')
  ) THEN
    RAISE EXCEPTION 'permission_denied: cancellation requires admin/finance/supply_chain'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.orders
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancellation_reason = COALESCE(_reason, cancellation_reason),
      updated_at = now()
  WHERE id = _order_id
    AND source = 'website'
    AND status = 'po_received'
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'order_not_eligible: order not found, not website-sourced, or not in pending payment state'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_website_order(uuid, text) TO authenticated;

-- =====================================================================
-- 4. Trigger: cancelled pending-payment website orders → leads.
--    (leads table has no `source` column — use form_type='website_abandoned')
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trg_website_cancelled_to_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_id BIGINT;
  _order_tag TEXT;
BEGIN
  IF NEW.source <> 'website' THEN RETURN NEW; END IF;
  IF OLD.status <> 'po_received' THEN RETURN NEW; END IF;
  IF NEW.status <> 'cancelled' THEN RETURN NEW; END IF;

  _order_tag := 'order#' || COALESCE(NEW.order_number, NEW.id::text);

  SELECT id INTO _existing_id
  FROM public.leads
  WHERE form_type = 'website_abandoned'
    AND message LIKE '%' || _order_tag || '%'
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN RETURN NEW; END IF;

  INSERT INTO public.leads (
    name, phone, email, company,
    form_type, status, subject, message, created_at
  ) VALUES (
    NEW.customer_name,
    NEW.customer_phone,
    NEW.customer_email,
    NEW.customer_company,
    'website_abandoned',
    'new',
    'Website cart abandoned',
    'Customer abandoned payment on xboom.in. ' || _order_tag
      || ' · ₹' || COALESCE(NEW.total_sales_amount, 0)::text
      || ' · product: ' || COALESCE(NEW.product_name, 'unknown'),
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_website_cancelled_to_lead ON public.orders;
CREATE TRIGGER trg_orders_website_cancelled_to_lead
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trg_website_cancelled_to_lead();

-- =====================================================================
-- 5. Backfill: existing cancelled website orders → leads (one-time).
-- =====================================================================

INSERT INTO public.leads (
  name, phone, email, company,
  form_type, status, subject, message, created_at
)
SELECT
  o.customer_name,
  o.customer_phone,
  o.customer_email,
  o.customer_company,
  'website_abandoned',
  'new',
  'Website cart abandoned',
  'Customer abandoned payment on xboom.in. order#' || COALESCE(o.order_number, o.id::text)
    || ' · ₹' || COALESCE(o.total_sales_amount, 0)::text
    || ' · product: ' || COALESCE(o.product_name, 'unknown'),
  COALESCE(o.cancelled_at, o.updated_at)
FROM public.orders o
WHERE o.source = 'website'
  AND o.status = 'cancelled'
  AND NOT EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.form_type = 'website_abandoned'
      AND l.message LIKE '%order#' || COALESCE(o.order_number, o.id::text) || '%'
  );
