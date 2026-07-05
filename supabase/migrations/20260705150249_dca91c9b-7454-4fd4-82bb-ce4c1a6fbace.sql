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

  -- Match by reference_number (from raw JSON or column) against BOTH order_number
  -- formats: full ORDxxxxxxx and bare Woo numerics (e.g. 143800). Trimmed + case-insensitive.
  WITH refs AS (
    SELECT z.invoice_id,
           lower(btrim(COALESCE(NULLIF(z.raw->>'reference_number',''), z.reference_number))) AS ref
    FROM public.zoho_books_invoices z
    WHERE z.linked_order_id IS NULL
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

  -- Anything still unlinked and previously untried → mark unmatched
  UPDATE public.zoho_books_invoices
     SET match_status = 'unmatched'
   WHERE linked_order_id IS NULL
     AND match_status = 'pending';
  GET DIAGNOSTICS unmatched_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'matched_cf', matched_cf,
    'matched_reference', matched_ref,
    'newly_unmatched', unmatched_count
  );
END;
$function$;