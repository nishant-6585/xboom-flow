
-- 1) Skip voided invoices from the auto-matcher
CREATE OR REPLACE FUNCTION public.match_zoho_invoices_to_orders()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  matched_ref int := 0;
  matched_cf int := 0;
  unmatched_count int := 0;
BEGIN
  -- Match by cf_order_id / cf_order_number (custom field on invoice.raw)
  WITH candidates AS (
    SELECT z.invoice_id,
           COALESCE(z.raw->>'cf_order_id', z.raw->>'cf_order_number') AS cf_val
    FROM public.zoho_books_invoices z
    WHERE z.linked_order_id IS NULL
      AND COALESCE(z.status, '') <> 'void'
      AND (z.raw->>'cf_order_id' IS NOT NULL OR z.raw->>'cf_order_number' IS NOT NULL)
  ), upd AS (
    UPDATE public.zoho_books_invoices z
       SET linked_order_id = o.id,
           linked_order_number = o.order_number,
           match_method = 'cf_order_id',
           match_status = 'matched',
           matched_at = now()
      FROM candidates c
      JOIN public.orders o ON o.order_number = c.cf_val
     WHERE z.invoice_id = c.invoice_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO matched_cf FROM upd;

  WITH refs AS (
    SELECT z.invoice_id,
           lower(btrim(COALESCE(NULLIF(z.raw->>'reference_number',''), z.reference_number))) AS ref
    FROM public.zoho_books_invoices z
    WHERE z.linked_order_id IS NULL
      AND COALESCE(z.status, '') <> 'void'
      AND COALESCE(NULLIF(z.raw->>'reference_number',''), z.reference_number) IS NOT NULL
  ), upd AS (
    UPDATE public.zoho_books_invoices z
       SET linked_order_id = o.id,
           linked_order_number = o.order_number,
           match_method = 'reference_number',
           match_status = 'matched',
           matched_at = now()
      FROM refs r
      JOIN public.orders o
        ON lower(btrim(o.order_number)) = r.ref
        OR lower(btrim(o.order_number)) = regexp_replace(r.ref, '^ord', '')
        OR 'ord' || lower(btrim(o.order_number)) = r.ref
     WHERE z.invoice_id = r.invoice_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO matched_ref FROM upd;

  UPDATE public.zoho_books_invoices
     SET match_status = 'unmatched'
   WHERE linked_order_id IS NULL
     AND match_status = 'pending'
     AND COALESCE(status, '') <> 'void';

  UPDATE public.zoho_books_invoices
     SET match_status = 'void'
   WHERE status = 'void'
     AND COALESCE(match_status,'') NOT IN ('void');
  GET DIAGNOSTICS unmatched_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'matched_cf', matched_cf,
    'matched_reference', matched_ref,
    'marked_void', unmatched_count
  );
END;
$function$;

-- 2) Add order flag + trigger to notify finance when a linked invoice becomes void
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS has_voided_zoho_invoice boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.zoho_invoice_void_watch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_number text;
BEGIN
  -- Only act when status transitions INTO 'void' AND row was previously linked to an order
  IF NEW.status = 'void'
     AND COALESCE(OLD.status,'') <> 'void'
     AND NEW.linked_order_id IS NOT NULL THEN

    -- Flag the order
    UPDATE public.orders
       SET has_voided_zoho_invoice = true
     WHERE id = NEW.linked_order_id
    RETURNING order_number INTO v_order_number;

    -- Notify finance + admin
    INSERT INTO public.notifications (order_id, type, title, message, target_role)
    VALUES
      (NEW.linked_order_id, 'zoho_invoice_voided',
       'Zoho invoice voided: ' || COALESCE(NEW.invoice_number, NEW.invoice_id),
       'Invoice ' || COALESCE(NEW.invoice_number, NEW.invoice_id)
         || ' attached to order ' || COALESCE(v_order_number,'?')
         || ' was marked VOID in Zoho. A replacement invoice needs to be attached.',
       'finance'),
      (NEW.linked_order_id, 'zoho_invoice_voided',
       'Zoho invoice voided: ' || COALESCE(NEW.invoice_number, NEW.invoice_id),
       'Invoice ' || COALESCE(NEW.invoice_number, NEW.invoice_id)
         || ' attached to order ' || COALESCE(v_order_number,'?')
         || ' was marked VOID in Zoho. A replacement invoice needs to be attached.',
       'admin');

    -- Update match_status so it drops off matched lists
    NEW.match_status := 'void';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_zoho_invoice_void_watch ON public.zoho_books_invoices;
CREATE TRIGGER trg_zoho_invoice_void_watch
BEFORE UPDATE OF status ON public.zoho_books_invoices
FOR EACH ROW EXECUTE FUNCTION public.zoho_invoice_void_watch();
