
-- Zoho poller schema additions
ALTER TABLE public.zoho_books_invoices
  ADD COLUMN IF NOT EXISTS match_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS pdf_attached_invoice_id uuid,
  ADD COLUMN IF NOT EXISTS pdf_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_hash text;

CREATE INDEX IF NOT EXISTS idx_zoho_books_invoices_match_status
  ON public.zoho_books_invoices(match_status);

ALTER TABLE public.order_invoices
  ADD COLUMN IF NOT EXISTS zoho_invoice_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_invoices_zoho_invoice_id
  ON public.order_invoices(zoho_invoice_id) WHERE zoho_invoice_id IS NOT NULL;

ALTER TABLE public.zoho_books_invoices
  ADD CONSTRAINT zoho_books_invoices_pdf_attached_fk
  FOREIGN KEY (pdf_attached_invoice_id)
  REFERENCES public.order_invoices(id) ON DELETE SET NULL
  NOT VALID;

-- Poller cursor state (single row keyed by provider)
CREATE TABLE IF NOT EXISTS public.zoho_poller_state (
  provider text PRIMARY KEY,
  last_polled_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.zoho_poller_state TO authenticated;
GRANT ALL ON public.zoho_poller_state TO service_role;

ALTER TABLE public.zoho_poller_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Finance can view zoho poller state"
  ON public.zoho_poller_state FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role));

INSERT INTO public.zoho_poller_state(provider) VALUES ('zoho_books')
  ON CONFLICT (provider) DO NOTHING;

-- Extend match RPC: mark match_status alongside linking
CREATE OR REPLACE FUNCTION public.match_zoho_invoices_to_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Match by reference_number == order_number
  WITH upd AS (
    UPDATE public.zoho_books_invoices z
       SET linked_order_id = o.id,
           linked_order_number = o.order_number,
           match_method = 'reference_number',
           match_status = 'matched',
           matched_at = now()
      FROM public.orders o
     WHERE z.linked_order_id IS NULL
       AND z.reference_number IS NOT NULL
       AND o.order_number = z.reference_number
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
$$;

-- Manual-attach helper for the admin UI
CREATE OR REPLACE FUNCTION public.attach_zoho_invoice_to_order(
  p_zoho_invoice_id text,
  p_order_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_number text;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT order_number INTO v_order_number FROM public.orders WHERE id = p_order_id;
  IF v_order_number IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  UPDATE public.zoho_books_invoices
     SET linked_order_id = p_order_id,
         linked_order_number = v_order_number,
         match_method = 'manual',
         match_status = 'matched',
         matched_at = now()
   WHERE invoice_id = p_zoho_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_zoho_invoice_to_order(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_zoho_invoice_to_order(text, uuid) TO authenticated;
