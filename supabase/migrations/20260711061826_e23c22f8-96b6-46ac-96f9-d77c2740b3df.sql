-- Fix website→manual transfer breakage in payment/procurement flow
CREATE OR REPLACE FUNCTION public.mark_website_order_paid(_woo_order_id text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Woo-linked check via external_id (source may now be 'manual' after attribution)
  UPDATE public.orders
  SET status = 'payment_received', updated_at = now()
  WHERE external_id = _woo_order_id
    AND status = 'po_received'
  RETURNING * INTO _orders_row;

  IF _orders_row.id IS NULL THEN
    RAISE EXCEPTION 'order_not_eligible: no internal orders row found for this woo_order_id in po_received state'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN _orders_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_create_procurement_on_website_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Woo-linked gate: transferred orders (source='manual', external_id NOT NULL) still qualify
  IF NEW.external_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'payment_received' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_procurements WHERE order_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  PERFORM public._create_procurement_for_order(NEW);
  RETURN NEW;
END $function$;