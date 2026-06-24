CREATE OR REPLACE FUNCTION public.flag_proforma_for_regenerate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_invoice_number text;
  v_flagged int;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  IF v_order_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  WITH upd AS (
    UPDATE public.order_invoices oi
       SET needs_regenerate = true,
           regenerate_reason = 'order_items changed',
           regenerate_flagged_at = now()
     WHERE oi.order_id = v_order_id
       AND oi.document_type = 'proforma'
       AND COALESCE(oi.needs_regenerate, false) = false
    RETURNING oi.invoice_number
  )
  SELECT count(*), max(invoice_number) INTO v_flagged, v_invoice_number FROM upd;

  IF COALESCE(v_flagged, 0) > 0 THEN
    SELECT order_number INTO v_order_number FROM public.orders WHERE id = v_order_id;
    INSERT INTO public.notifications (order_id, type, title, message, target_role, is_read)
    VALUES (
      v_order_id,
      'proforma_stale',
      'Proforma needs regeneration',
      COALESCE('Order ' || v_order_number, 'An order') ||
        ' line items changed — proforma ' || COALESCE(v_invoice_number, '') ||
        ' is out of date. Open the order to regenerate.',
      'supply_chain',
      false
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;