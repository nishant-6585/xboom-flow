
ALTER TABLE public.order_invoices
  ADD COLUMN IF NOT EXISTS needs_regenerate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS regenerate_reason text,
  ADD COLUMN IF NOT EXISTS regenerate_flagged_at timestamptz;

CREATE OR REPLACE FUNCTION public.flag_proforma_for_regenerate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  IF v_order_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  UPDATE public.order_invoices
    SET needs_regenerate = true,
        regenerate_reason = 'order_items changed',
        regenerate_flagged_at = now()
   WHERE order_id = v_order_id
     AND invoice_type = 'proforma'
     AND COALESCE(needs_regenerate, false) = false;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_proforma_on_order_items ON public.order_items;
CREATE TRIGGER trg_flag_proforma_on_order_items
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.flag_proforma_for_regenerate();
