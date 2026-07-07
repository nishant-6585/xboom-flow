-- ============================================================================
-- Rebuild guard_orders_sensitive_updates: drop references to columns that
-- do not exist on public.orders (refund_amount, refund_date, total,
-- subtotal, gst_amount). Only real columns are gated.
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

  IF NEW.payment_status       IS DISTINCT FROM OLD.payment_status
     OR NEW.amount_paid       IS DISTINCT FROM OLD.amount_paid
     OR NEW.selling_price     IS DISTINCT FROM OLD.selling_price
     OR NEW.order_outcome     IS DISTINCT FROM OLD.order_outcome
     OR NEW.discount_amount   IS DISTINCT FROM OLD.discount_amount
     OR NEW.refund_status     IS DISTINCT FROM OLD.refund_status
     OR NEW.refund_requested_at IS DISTINCT FROM OLD.refund_requested_at
     OR NEW.refund_reason     IS DISTINCT FROM OLD.refund_reason
     OR NEW.total_sales_amount IS DISTINCT FROM OLD.total_sales_amount
     OR NEW.sales_person_id   IS DISTINCT FROM OLD.sales_person_id
  THEN
    RAISE EXCEPTION 'Only admin/finance/sales_manager can change financial, refund, or attribution fields on orders'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- Rebuild guard_invoices_sensitive_updates: drop non-existent gst_amount,
-- tax_amount, total. Keeps every real financial / signature field.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_invoices_sensitive_updates()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := public.has_role(auth.uid(), 'admin')
                OR public.has_role(auth.uid(), 'finance');
  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.amount_paid     IS DISTINCT FROM OLD.amount_paid
     OR NEW.balance_due  IS DISTINCT FROM OLD.balance_due
     OR NEW.status       IS DISTINCT FROM OLD.status
     OR NEW.signed_by    IS DISTINCT FROM OLD.signed_by
     OR NEW.signature_url IS DISTINCT FROM OLD.signature_url
     OR NEW.invoice_hash IS DISTINCT FROM OLD.invoice_hash
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.subtotal     IS DISTINCT FROM OLD.subtotal
     OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
  THEN
    RAISE EXCEPTION 'Only admin/finance can change financial or signature fields on invoices'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- Rebuild guard_order_items_sensitive_updates: order_items has no `total`
-- column (values are computed downstream from unit_price * quantity).
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

  IF NEW.unit_price         IS DISTINCT FROM OLD.unit_price
     OR NEW.quantity        IS DISTINCT FROM OLD.quantity
     OR NEW.procurement_rate IS DISTINCT FROM OLD.procurement_rate
     OR NEW.procurement_gst_percent IS DISTINCT FROM OLD.procurement_gst_percent
     OR NEW.procurement_gst_amount  IS DISTINCT FROM OLD.procurement_gst_amount
     OR NEW.sales_gst_percent IS DISTINCT FROM OLD.sales_gst_percent
     OR NEW.sales_gst_amount  IS DISTINCT FROM OLD.sales_gst_amount
  THEN
    RAISE EXCEPTION 'Only admin/finance/supply_chain/sales_manager can change price/cost/quantity/GST fields on order items'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;