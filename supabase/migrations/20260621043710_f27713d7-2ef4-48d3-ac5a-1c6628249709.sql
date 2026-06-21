
-- Link Zoho invoices to internal orders (exact match only on order_number)

ALTER TABLE public.zoho_books_invoices
  ADD COLUMN IF NOT EXISTS linked_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_order_number text,
  ADD COLUMN IF NOT EXISTS match_method text,
  ADD COLUMN IF NOT EXISTS matched_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_zoho_invoices_linked_order_id ON public.zoho_books_invoices(linked_order_id);
CREATE INDEX IF NOT EXISTS idx_zoho_invoices_linked_order_number ON public.zoho_books_invoices(linked_order_number);
CREATE INDEX IF NOT EXISTS idx_zoho_invoices_cf_order_id ON public.zoho_books_invoices((raw->>'cf_order_id'));
CREATE INDEX IF NOT EXISTS idx_zoho_invoices_reference_number ON public.zoho_books_invoices(reference_number);

-- Allow admins/finance to update linkage fields
DROP POLICY IF EXISTS "Admins and Finance can update zoho invoice links" ON public.zoho_books_invoices;
CREATE POLICY "Admins and Finance can update zoho invoice links"
  ON public.zoho_books_invoices
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role));

GRANT UPDATE ON public.zoho_books_invoices TO authenticated;

-- Auto-match RPC: exact match cf_order_id then reference_number → orders.order_number
CREATE OR REPLACE FUNCTION public.match_zoho_invoices_to_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cf_matched int := 0;
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
  SELECT count(*) INTO v_cf_matched FROM upd;

  -- Pass 2: reference_number exact match
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
    'new_matches_cf_order_id', v_cf_matched,
    'new_matches_reference_number', v_ref_matched,
    'total_newly_matched', v_cf_matched + v_ref_matched
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_zoho_invoices_to_orders() TO authenticated;

-- Manual link / unlink
CREATE OR REPLACE FUNCTION public.link_zoho_invoice_manual(p_invoice_id text, p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_number text;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT order_number INTO v_order_number FROM orders WHERE id = p_order_id;
  IF v_order_number IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  UPDATE zoho_books_invoices
     SET linked_order_id = p_order_id,
         linked_order_number = v_order_number,
         match_method = 'manual',
         matched_at = now()
   WHERE invoice_id = p_invoice_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.link_zoho_invoice_manual(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unlink_zoho_invoice(p_invoice_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE zoho_books_invoices
     SET linked_order_id = NULL,
         linked_order_number = NULL,
         match_method = NULL,
         matched_at = NULL
   WHERE invoice_id = p_invoice_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.unlink_zoho_invoice(text) TO authenticated;

-- Reconciliation stats RPC
CREATE OR REPLACE FUNCTION public.zoho_reconciliation_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_inv int;
  v_linked_inv int;
  v_unlinked_inv int;
  v_total_orders_with_inv int;
  v_orders_without_inv int;
  v_total_orders int;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT count(*), count(*) FILTER (WHERE linked_order_id IS NOT NULL)
    INTO v_total_inv, v_linked_inv
    FROM zoho_books_invoices;
  v_unlinked_inv := v_total_inv - v_linked_inv;

  SELECT count(DISTINCT linked_order_id) INTO v_total_orders_with_inv
    FROM zoho_books_invoices WHERE linked_order_id IS NOT NULL;

  SELECT count(*) INTO v_total_orders FROM orders;
  v_orders_without_inv := v_total_orders - v_total_orders_with_inv;

  RETURN jsonb_build_object(
    'total_invoices', v_total_inv,
    'linked_invoices', v_linked_inv,
    'unlinked_invoices', v_unlinked_inv,
    'total_orders', v_total_orders,
    'orders_with_invoice', v_total_orders_with_inv,
    'orders_without_invoice', v_orders_without_inv
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.zoho_reconciliation_stats() TO authenticated;
