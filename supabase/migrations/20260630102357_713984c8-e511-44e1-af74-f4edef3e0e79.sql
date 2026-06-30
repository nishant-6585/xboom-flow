
CREATE OR REPLACE FUNCTION public.match_zoho_invoices_to_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cf_id_matched int := 0;
  v_cf_num_matched int := 0;
  v_ref_matched int := 0;
  v_total int := 0;
  v_already int := 0;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT count(*) INTO v_total FROM zoho_books_invoices;
  SELECT count(*) INTO v_already FROM zoho_books_invoices WHERE linked_order_id IS NOT NULL;

  -- Pass 1: cf_order_id exact match
  WITH cand AS (
    SELECT z.invoice_id, o.id AS order_id, o.order_number
    FROM zoho_books_invoices z
    JOIN orders o
      ON o.order_number = NULLIF(z.raw->>'cf_order_id','')
    WHERE z.linked_order_id IS NULL
  ), upd AS (
    UPDATE zoho_books_invoices z
       SET linked_order_id = c.order_id,
           linked_order_number = c.order_number,
           match_method = 'cf_order_id',
           matched_at = now()
      FROM cand c
     WHERE z.invoice_id = c.invoice_id
    RETURNING 1
  )
  SELECT count(*) INTO v_cf_id_matched FROM upd;

  -- Pass 2: cf_order_number exact match (Zoho "Order Number" custom field)
  WITH cand AS (
    SELECT z.invoice_id, o.id AS order_id, o.order_number
    FROM zoho_books_invoices z
    JOIN orders o
      ON o.order_number = NULLIF(z.raw->>'cf_order_number','')
    WHERE z.linked_order_id IS NULL
  ), upd AS (
    UPDATE zoho_books_invoices z
       SET linked_order_id = c.order_id,
           linked_order_number = c.order_number,
           match_method = 'cf_order_number',
           matched_at = now()
      FROM cand c
     WHERE z.invoice_id = c.invoice_id
    RETURNING 1
  )
  SELECT count(*) INTO v_cf_num_matched FROM upd;

  -- Pass 3: reference_number exact match
  WITH cand AS (
    SELECT z.invoice_id, o.id AS order_id, o.order_number
    FROM zoho_books_invoices z
    JOIN orders o
      ON o.order_number = NULLIF(z.reference_number,'')
    WHERE z.linked_order_id IS NULL
  ), upd AS (
    UPDATE zoho_books_invoices z
       SET linked_order_id = c.order_id,
           linked_order_number = c.order_number,
           match_method = 'reference_number',
           matched_at = now()
      FROM cand c
     WHERE z.invoice_id = c.invoice_id
    RETURNING 1
  )
  SELECT count(*) INTO v_ref_matched FROM upd;

  RETURN jsonb_build_object(
    'total_invoices', v_total,
    'already_linked', v_already,
    'new_matches_cf_order_id', v_cf_id_matched,
    'new_matches_cf_order_number', v_cf_num_matched,
    'new_matches_reference_number', v_ref_matched,
    'total_newly_matched', v_cf_id_matched + v_cf_num_matched + v_ref_matched
  );
END;
$function$;
