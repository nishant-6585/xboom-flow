
-- ============================================================================
-- Guard: expenses — block self-approval and payment edits
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_expenses_sensitive_updates()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance');
  IF is_privileged THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_by_name IS DISTINCT FROM OLD.approved_by_name
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
     OR NEW.paid_from_petty_cash IS DISTINCT FROM OLD.paid_from_petty_cash
     OR NEW.payment_notes IS DISTINCT FROM OLD.payment_notes THEN
    RAISE EXCEPTION 'Only admin/finance can change approval or payment fields on expenses';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_expenses_sensitive_updates_trg ON public.expenses;
CREATE TRIGGER guard_expenses_sensitive_updates_trg
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_expenses_sensitive_updates();

-- ============================================================================
-- Guard: orders — block sales rep edits to payment/financial/outcome fields
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_orders_sensitive_updates()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := public.has_role(auth.uid(), 'admin')
                OR public.has_role(auth.uid(), 'finance')
                OR public.has_role(auth.uid(), 'sales_manager');
  IF is_privileged THEN
    RETURN NEW;
  END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
     OR NEW.selling_price IS DISTINCT FROM OLD.selling_price
     OR NEW.order_outcome IS DISTINCT FROM OLD.order_outcome
     OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
     OR NEW.refund_amount IS DISTINCT FROM OLD.refund_amount
     OR NEW.refund_status IS DISTINCT FROM OLD.refund_status
     OR NEW.refund_date IS DISTINCT FROM OLD.refund_date
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.gst_amount IS DISTINCT FROM OLD.gst_amount
     OR NEW.sales_person_id IS DISTINCT FROM OLD.sales_person_id THEN
    RAISE EXCEPTION 'Only admin/finance/sales_manager can change financial or outcome fields on orders';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_orders_sensitive_updates_trg ON public.orders;
CREATE TRIGGER guard_orders_sensitive_updates_trg
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_orders_sensitive_updates();

-- ============================================================================
-- Guard: order_items — block sales edits to cost/margin fields
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_order_items_sensitive_updates()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := public.has_role(auth.uid(), 'admin')
                OR public.has_role(auth.uid(), 'finance')
                OR public.has_role(auth.uid(), 'supply_chain')
                OR public.has_role(auth.uid(), 'sales_manager');
  IF is_privileged THEN
    RETURN NEW;
  END IF;
  IF NEW.unit_price IS DISTINCT FROM OLD.unit_price
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.procurement_rate IS DISTINCT FROM OLD.procurement_rate
     OR NEW.procurement_gst_percent IS DISTINCT FROM OLD.procurement_gst_percent
     OR NEW.procurement_gst_amount IS DISTINCT FROM OLD.procurement_gst_amount
     OR NEW.sales_gst_percent IS DISTINCT FROM OLD.sales_gst_percent
     OR NEW.sales_gst_amount IS DISTINCT FROM OLD.sales_gst_amount
     OR NEW.total IS DISTINCT FROM OLD.total THEN
    RAISE EXCEPTION 'Only admin/finance/supply_chain/sales_manager can change price/cost/quantity/GST fields on order items';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_order_items_sensitive_updates_trg ON public.order_items;
CREATE TRIGGER guard_order_items_sensitive_updates_trg
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_items_sensitive_updates();

-- ============================================================================
-- Guard: pipeline_orders — block sales edits to conversion/value metrics
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_pipeline_orders_sensitive_updates()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := public.has_role(auth.uid(), 'admin')
                OR public.has_role(auth.uid(), 'sales_manager');
  IF is_privileged THEN
    RETURN NEW;
  END IF;
  IF NEW.expected_price IS DISTINCT FROM OLD.expected_price
     OR NEW.probability IS DISTINCT FROM OLD.probability
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.sales_person_id IS DISTINCT FROM OLD.sales_person_id THEN
    RAISE EXCEPTION 'Only admin/sales_manager can change value or conversion metrics on pipeline orders';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_pipeline_orders_sensitive_updates_trg ON public.pipeline_orders;
CREATE TRIGGER guard_pipeline_orders_sensitive_updates_trg
  BEFORE UPDATE ON public.pipeline_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_pipeline_orders_sensitive_updates();

-- ============================================================================
-- Guard: google_ads_leads — block sales edits to conversion metrics
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_google_ads_leads_sensitive_updates()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := public.has_role(auth.uid(), 'admin')
                OR public.has_role(auth.uid(), 'sales_manager')
                OR public.has_role(auth.uid(), 'marketing');
  IF is_privileged THEN
    RETURN NEW;
  END IF;
  IF NEW.is_converted IS DISTINCT FROM OLD.is_converted
     OR NEW.conversion_value IS DISTINCT FROM OLD.conversion_value THEN
    RAISE EXCEPTION 'Only admin/sales_manager/marketing can change conversion metrics on google ads leads';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_google_ads_leads_sensitive_updates_trg ON public.google_ads_leads;
CREATE TRIGGER guard_google_ads_leads_sensitive_updates_trg
  BEFORE UPDATE ON public.google_ads_leads
  FOR EACH ROW EXECUTE FUNCTION public.guard_google_ads_leads_sensitive_updates();

-- ============================================================================
-- Guard: invoices — block creator/signer/submitter from editing financial/signature fields
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_invoices_sensitive_updates()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance');
  IF is_privileged THEN
    RETURN NEW;
  END IF;
  IF NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
     OR NEW.balance_due IS DISTINCT FROM OLD.balance_due
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.signed_by IS DISTINCT FROM OLD.signed_by
     OR NEW.signature_url IS DISTINCT FROM OLD.signature_url
     OR NEW.invoice_hash IS DISTINCT FROM OLD.invoice_hash
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.gst_amount IS DISTINCT FROM OLD.gst_amount
     OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount THEN
    RAISE EXCEPTION 'Only admin/finance can change financial or signature fields on invoices';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_invoices_sensitive_updates_trg ON public.invoices;
CREATE TRIGGER guard_invoices_sensitive_updates_trg
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoices_sensitive_updates();

-- ============================================================================
-- Guard: quotes — block sales self-approval / discount edits when approval required
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_quotes_sensitive_updates()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := public.has_role(auth.uid(), 'admin')
                OR public.has_role(auth.uid(), 'finance')
                OR public.has_role(auth.uid(), 'sales_manager');
  IF is_privileged THEN
    RETURN NEW;
  END IF;
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_by_name IS DISTINCT FROM OLD.approved_by_name
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
     OR NEW.discount_percent IS DISTINCT FROM OLD.discount_percent THEN
    RAISE EXCEPTION 'Only admin/finance/sales_manager can change approval, status, or discount fields on quotes';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_quotes_sensitive_updates_trg ON public.quotes;
CREATE TRIGGER guard_quotes_sensitive_updates_trg
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.guard_quotes_sensitive_updates();

-- ============================================================================
-- Repairs — narrow UPDATE policy to same roles allowed to SELECT, and guard financial cols
-- ============================================================================
DROP POLICY IF EXISTS "Approved users can update repairs" ON public.repairs;

CREATE POLICY "Privileged roles can update repairs"
ON public.repairs
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'supply_chain')
  OR public.has_role(auth.uid(), 'sales')
  OR public.has_role(auth.uid(), 'sales_manager')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'supply_chain')
  OR public.has_role(auth.uid(), 'sales')
  OR public.has_role(auth.uid(), 'sales_manager')
);

CREATE OR REPLACE FUNCTION public.guard_repairs_sensitive_updates()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := public.has_role(auth.uid(), 'admin')
                OR public.has_role(auth.uid(), 'supply_chain')
                OR public.has_role(auth.uid(), 'finance');
  IF is_privileged THEN
    RETURN NEW;
  END IF;
  IF NEW.repair_cost_charged IS DISTINCT FROM OLD.repair_cost_charged
     OR NEW.advance_amount IS DISTINCT FROM OLD.advance_amount
     OR NEW.total_quote_amount IS DISTINCT FROM OLD.total_quote_amount
     OR NEW.profit IS DISTINCT FROM OLD.profit
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    RAISE EXCEPTION 'Only admin/supply_chain/finance can change financial fields on repairs';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_repairs_sensitive_updates_trg ON public.repairs;
CREATE TRIGGER guard_repairs_sensitive_updates_trg
  BEFORE UPDATE ON public.repairs
  FOR EACH ROW EXECUTE FUNCTION public.guard_repairs_sensitive_updates();
