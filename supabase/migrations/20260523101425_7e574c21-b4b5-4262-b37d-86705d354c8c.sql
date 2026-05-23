
CREATE TABLE IF NOT EXISTS public.order_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  invoice_number text,
  file_name text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_invoices_order_id ON public.order_invoices(order_id);

ALTER TABLE public.order_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View order invoices follows order visibility"
ON public.order_invoices FOR SELECT
USING (
  is_user_approved(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_invoices.order_id
      AND (
        has_role(auth.uid(),'admin'::app_role)
        OR has_role(auth.uid(),'finance'::app_role)
        OR has_role(auth.uid(),'supply_chain'::app_role)
        OR has_role(auth.uid(),'sales_manager'::app_role)
        OR (has_role(auth.uid(),'sales'::app_role) AND o.sales_person_id = auth.uid())
      )
  )
);

CREATE POLICY "Privileged roles can insert order invoices"
ON public.order_invoices FOR INSERT
WITH CHECK (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'finance'::app_role)
    OR has_role(auth.uid(),'supply_chain'::app_role)
    OR has_role(auth.uid(),'sales_manager'::app_role)
  )
);

CREATE POLICY "Privileged roles can update order invoices"
ON public.order_invoices FOR UPDATE
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'finance'::app_role)
    OR has_role(auth.uid(),'supply_chain'::app_role)
    OR has_role(auth.uid(),'sales_manager'::app_role)
  )
);

CREATE POLICY "Privileged roles can delete order invoices"
ON public.order_invoices FOR DELETE
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'finance'::app_role)
    OR has_role(auth.uid(),'supply_chain'::app_role)
    OR has_role(auth.uid(),'sales_manager'::app_role)
  )
);

CREATE TRIGGER trg_order_invoices_updated_at
BEFORE UPDATE ON public.order_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill existing single invoice_url values into the new table.
-- Handles both new-style storage paths and old public URLs.
INSERT INTO public.order_invoices (order_id, storage_path, invoice_number, file_name, created_at)
SELECT
  o.id,
  CASE
    WHEN o.invoice_url LIKE 'http%' THEN
      regexp_replace(o.invoice_url, '^.*/invoices/', '')
    ELSE o.invoice_url
  END AS storage_path,
  NULLIF(o.invoice_number, '') AS invoice_number,
  regexp_replace(o.invoice_url, '^.*/', '') AS file_name,
  COALESCE(o.updated_at, o.created_at)
FROM public.orders o
WHERE o.invoice_url IS NOT NULL
  AND o.invoice_url <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.order_invoices oi WHERE oi.order_id = o.id
  );
