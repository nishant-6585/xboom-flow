
-- 1) Allow order_invoices to point at either an internal order OR a woocommerce_orders row
ALTER TABLE public.order_invoices
  ALTER COLUMN order_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS woocommerce_order_id uuid REFERENCES public.woocommerce_orders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_order_invoices_woo_order_id ON public.order_invoices(woocommerce_order_id);

-- Ensure exactly one of order_id / woocommerce_order_id is set (enforced via trigger, not CHECK,
-- so future referenced-row changes don't break it).
CREATE OR REPLACE FUNCTION public.validate_order_invoice_link()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.order_id IS NULL AND NEW.woocommerce_order_id IS NULL)
     OR (NEW.order_id IS NOT NULL AND NEW.woocommerce_order_id IS NOT NULL) THEN
    RAISE EXCEPTION 'order_invoices must reference exactly one of order_id or woocommerce_order_id';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_order_invoice_link ON public.order_invoices;
CREATE TRIGGER trg_validate_order_invoice_link
  BEFORE INSERT OR UPDATE ON public.order_invoices
  FOR EACH ROW EXECUTE FUNCTION public.validate_order_invoice_link();

-- 2) Extend existing RLS so privileged roles can view/insert/update/delete woo-linked invoices too
DROP POLICY IF EXISTS "View order invoices follows order visibility" ON public.order_invoices;
CREATE POLICY "View order invoices follows order visibility"
ON public.order_invoices FOR SELECT
USING (
  is_user_approved(auth.uid()) AND (
    -- Internal order path
    (order_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_invoices.order_id
        AND (
          has_role(auth.uid(),'admin'::app_role)
          OR has_role(auth.uid(),'finance'::app_role)
          OR has_role(auth.uid(),'supply_chain'::app_role)
          OR has_role(auth.uid(),'sales_manager'::app_role)
          OR (has_role(auth.uid(),'sales'::app_role) AND o.sales_person_id = auth.uid())
        )
    ))
    OR
    -- Woo path: privileged roles only
    (woocommerce_order_id IS NOT NULL AND (
      has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'finance'::app_role)
      OR has_role(auth.uid(),'supply_chain'::app_role)
      OR has_role(auth.uid(),'sales_manager'::app_role)
    ))
  )
);

-- 3) Proforma audit log
CREATE TABLE IF NOT EXISTS public.proforma_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.order_invoices(id) ON DELETE SET NULL,
  order_id uuid,
  woocommerce_order_id uuid,
  action text NOT NULL,
  proforma_number text,
  generated_by uuid,
  generated_by_name text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.proforma_audit_log TO authenticated;
GRANT ALL ON public.proforma_audit_log TO service_role;

CREATE INDEX IF NOT EXISTS idx_proforma_audit_order ON public.proforma_audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_proforma_audit_woo ON public.proforma_audit_log(woocommerce_order_id);
CREATE INDEX IF NOT EXISTS idx_proforma_audit_invoice ON public.proforma_audit_log(invoice_id);

ALTER TABLE public.proforma_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Privileged roles view proforma audit"
ON public.proforma_audit_log FOR SELECT
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'finance'::app_role)
    OR has_role(auth.uid(),'supply_chain'::app_role)
    OR has_role(auth.uid(),'sales_manager'::app_role)
  )
);

CREATE POLICY "Privileged roles insert proforma audit"
ON public.proforma_audit_log FOR INSERT
WITH CHECK (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'finance'::app_role)
    OR has_role(auth.uid(),'supply_chain'::app_role)
    OR has_role(auth.uid(),'sales_manager'::app_role)
  )
  AND generated_by = auth.uid()
);
