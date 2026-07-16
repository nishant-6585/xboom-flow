
-- 1) Rebuild guard_orders_sensitive_updates to add own-order allowances and price-refresh bypass.

CREATE OR REPLACE FUNCTION public.guard_orders_sensitive_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean;
  is_own boolean;
  items_subtotal numeric;
  recomputed_total numeric;
  effective_discount numeric;
  effective_delivery numeric;
  total_change_ok boolean := false;
BEGIN
  -- Trusted derived writes: payment sync (see sync_order_amount_paid) and
  -- refresh_order_price_from_pricelist RPC each set their own transaction-local GUC.
  IF current_setting('app.orders_payment_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF current_setting('app.price_refresh_bypass', true) = 'on' THEN
    RETURN NEW;
  END IF;

  is_privileged := public.has_role(auth.uid(), 'admin')
                OR public.has_role(auth.uid(), 'finance')
                OR public.has_role(auth.uid(), 'sales_manager')
                OR public.has_role(auth.uid(), 'supply_chain');
  IF is_privileged THEN
    RETURN NEW;
  END IF;

  is_own := (auth.uid() IS NOT NULL AND auth.uid() = OLD.sales_person_id);

  IF NEW.total_sales_amount IS DISTINCT FROM OLD.total_sales_amount THEN
    SELECT COALESCE(SUM(COALESCE(unit_price, 0) * COALESCE(quantity, 0)), 0)
      INTO items_subtotal
      FROM public.order_items
     WHERE order_id = NEW.id;

    effective_discount := COALESCE(NEW.discount_amount, OLD.discount_amount, 0);
    effective_delivery := COALESCE(NEW.delivery_charges, OLD.delivery_charges, 0);
    recomputed_total := GREATEST(0, items_subtotal - effective_discount + effective_delivery);

    IF abs(COALESCE(NEW.total_sales_amount, 0) - recomputed_total) <= 0.01 THEN
      total_change_ok := true;
    END IF;

    -- Also permit own-order sales to change total_sales_amount when the delta
    -- exactly mirrors a discount change on the same UPDATE (single-line orders
    -- that don't have order_items rows to derive from).
    IF is_own
       AND NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
       AND abs(
             (COALESCE(OLD.total_sales_amount, 0) - COALESCE(NEW.total_sales_amount, 0))
             -
             (COALESCE(NEW.discount_amount, 0) - COALESCE(OLD.discount_amount, 0))
           ) <= 0.01
    THEN
      total_change_ok := true;
    END IF;
  END IF;

  -- ALWAYS-blocked fields for non-privileged (even owners).
  IF NEW.payment_status         IS DISTINCT FROM OLD.payment_status
     OR NEW.amount_paid         IS DISTINCT FROM OLD.amount_paid
     OR NEW.selling_price       IS DISTINCT FROM OLD.selling_price
     OR NEW.refund_status       IS DISTINCT FROM OLD.refund_status
     OR NEW.refund_requested_at IS DISTINCT FROM OLD.refund_requested_at
     OR NEW.refund_reason       IS DISTINCT FROM OLD.refund_reason
     OR NEW.sales_person_id     IS DISTINCT FROM OLD.sales_person_id
  THEN
    RAISE EXCEPTION 'Only admin/finance/sales_manager/supply_chain can change financial, refund, or attribution fields on orders'
      USING ERRCODE = '42501';
  END IF;

  -- Own-order-only allowances: discount_amount, order_outcome, and a
  -- total_sales_amount that mirrors the discount delta or matches the
  -- item-driven recompute.
  IF NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
     OR NEW.order_outcome IS DISTINCT FROM OLD.order_outcome
     OR (NEW.total_sales_amount IS DISTINCT FROM OLD.total_sales_amount AND NOT total_change_ok)
  THEN
    IF NOT is_own THEN
      RAISE EXCEPTION 'Only the order owner (or admin/sales_manager) can change discount / outcome / total on this order'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) price_refresh_grants table + capability function + seed Sanu Sabu.

CREATE TABLE IF NOT EXISTS public.price_refresh_grants (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by  UUID REFERENCES auth.users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  note        TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_refresh_grants TO authenticated;
GRANT ALL ON public.price_refresh_grants TO service_role;

ALTER TABLE public.price_refresh_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage price refresh grants" ON public.price_refresh_grants;
CREATE POLICY "Admins manage price refresh grants" ON public.price_refresh_grants
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Grant holders see own row" ON public.price_refresh_grants;
CREATE POLICY "Grant holders see own row" ON public.price_refresh_grants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

INSERT INTO public.price_refresh_grants (user_id, note)
VALUES ('ac290dd5-7f28-4930-9a15-52f626e31938', 'Initial supply-chain grant for pricelist-derived price refresh')
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_refresh_order_price(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'sales_manager')
    OR EXISTS (SELECT 1 FROM public.price_refresh_grants WHERE user_id = _user_id);
$$;

GRANT EXECUTE ON FUNCTION public.can_refresh_order_price(uuid) TO authenticated;

-- 3) refresh_order_price_from_pricelist(p_order_id uuid) RPC.

CREATE OR REPLACE FUNCTION public.refresh_order_price_from_pricelist(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor        uuid := auth.uid();
  v_order        public.orders%ROWTYPE;
  v_price        numeric;
  v_matched_id   uuid;
  v_matched_name text;
  v_qty          numeric;
  v_discount     numeric;
  v_new_total    numeric;
  v_old_price    numeric;
  v_old_total    numeric;
BEGIN
  IF NOT public.can_refresh_order_price(v_actor) THEN
    RAISE EXCEPTION 'Only admin, sales_manager, or granted users can refresh order price from pricelist'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found: %', p_order_id USING ERRCODE = 'P0002';
  END IF;

  -- Match by woo_sku first (exact), then by product_name (case-insensitive equality).
  SELECT id, COALESCE(website_price, unit_price), product_name
    INTO v_matched_id, v_price, v_matched_name
    FROM public.pricelist
   WHERE (v_order.product_code IS NOT NULL AND woo_sku IS NOT NULL AND woo_sku = v_order.product_code)
   ORDER BY website_synced_at DESC NULLS LAST, updated_at DESC
   LIMIT 1;

  IF v_matched_id IS NULL AND v_order.product_name IS NOT NULL THEN
    SELECT id, COALESCE(website_price, unit_price), product_name
      INTO v_matched_id, v_price, v_matched_name
      FROM public.pricelist
     WHERE lower(product_name) = lower(v_order.product_name)
     ORDER BY website_synced_at DESC NULLS LAST, updated_at DESC
     LIMIT 1;
  END IF;

  IF v_matched_id IS NULL OR v_price IS NULL OR v_price <= 0 THEN
    RETURN jsonb_build_object('skipped', 'no_pricelist_match');
  END IF;

  v_qty       := COALESCE(v_order.quantity, 1);
  v_discount  := COALESCE(v_order.discount_amount, 0);
  v_new_total := GREATEST(0, v_qty * v_price - v_discount);
  v_old_price := v_order.selling_price;
  v_old_total := v_order.total_sales_amount;

  PERFORM set_config('app.price_refresh_bypass', 'on', true);
  UPDATE public.orders
     SET selling_price      = v_price,
         total_sales_amount = v_new_total,
         updated_at         = now()
   WHERE id = p_order_id;
  PERFORM set_config('app.price_refresh_bypass', 'off', true);

  -- Edit history entries (best-effort; ignore if actor missing).
  IF v_actor IS NOT NULL THEN
    INSERT INTO public.edit_history
      (table_name, record_id, field_name, old_value, new_value, edited_by, edited_by_name)
    VALUES
      ('orders', p_order_id, 'selling_price',
       v_old_price::text, v_price::text, v_actor,
       COALESCE((SELECT full_name FROM public.profiles WHERE id = v_actor), 'refresh_order_price_from_pricelist')),
      ('orders', p_order_id, 'total_sales_amount',
       v_old_total::text, v_new_total::text, v_actor,
       COALESCE((SELECT full_name FROM public.profiles WHERE id = v_actor), 'refresh_order_price_from_pricelist'));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'matched_pricelist_id', v_matched_id,
    'matched_product_name', v_matched_name,
    'old_selling_price', v_old_price,
    'new_selling_price', v_price,
    'old_total_sales_amount', v_old_total,
    'new_total_sales_amount', v_new_total,
    'quantity', v_qty,
    'discount_amount', v_discount
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.refresh_order_price_from_pricelist(uuid) TO authenticated;
