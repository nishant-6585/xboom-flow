-- =========================================================
-- 1) companies: tighten DELETE
-- =========================================================
DROP POLICY IF EXISTS "Approved users can delete companies" ON public.companies;
CREATE POLICY "Privileged or owner can delete companies"
  ON public.companies FOR DELETE
  USING (
    is_user_approved(auth.uid())
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'sales_manager'::app_role)
      OR account_owner_id = auth.uid()
      OR created_by = auth.uid()
    )
  );

-- =========================================================
-- 2) invoices: block non-finance from editing financial/status fields
-- =========================================================
CREATE OR REPLACE FUNCTION public.guard_invoices_sensitive_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(uid, 'admin') OR public.has_role(uid, 'finance') THEN
    RETURN NEW;
  END IF;

  IF NEW.total_amount     IS DISTINCT FROM OLD.total_amount
  OR NEW.amount_paid      IS DISTINCT FROM OLD.amount_paid
  OR NEW.balance_due      IS DISTINCT FROM OLD.balance_due
  OR NEW.subtotal         IS DISTINCT FROM OLD.subtotal
  OR NEW.tax_amount       IS DISTINCT FROM OLD.tax_amount
  OR NEW.discount_amount  IS DISTINCT FROM OLD.discount_amount
  OR NEW.status           IS DISTINCT FROM OLD.status
  OR NEW.invoice_number   IS DISTINCT FROM OLD.invoice_number
  OR NEW.due_date         IS DISTINCT FROM OLD.due_date
  OR NEW.invoice_date     IS DISTINCT FROM OLD.invoice_date
  THEN
    RAISE EXCEPTION 'Only admin or finance can modify financial or status fields on invoices.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_invoices_sensitive_updates ON public.invoices;
CREATE TRIGGER trg_guard_invoices_sensitive_updates
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoices_sensitive_updates();

-- =========================================================
-- 3) orders: block sales from editing financial/attribution/escalation fields
-- =========================================================
CREATE OR REPLACE FUNCTION public.guard_orders_sensitive_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(uid, 'admin')
     OR public.has_role(uid, 'sales_manager')
     OR public.has_role(uid, 'finance')
  THEN
    RETURN NEW;
  END IF;

  IF NEW.total_sales_amount       IS DISTINCT FROM OLD.total_sales_amount
  OR NEW.discount_amount          IS DISTINCT FROM OLD.discount_amount
  OR NEW.payment_status           IS DISTINCT FROM OLD.payment_status
  OR NEW.amount_paid              IS DISTINCT FROM OLD.amount_paid
  OR NEW.order_outcome            IS DISTINCT FROM OLD.order_outcome
  OR NEW.sales_attribution_locked IS DISTINCT FROM OLD.sales_attribution_locked
  OR NEW.is_escalated             IS DISTINCT FROM OLD.is_escalated
  OR NEW.escalated_by             IS DISTINCT FROM OLD.escalated_by
  OR NEW.priority                 IS DISTINCT FROM OLD.priority
  OR NEW.sales_person_id          IS DISTINCT FROM OLD.sales_person_id
  OR NEW.sales_person_name        IS DISTINCT FROM OLD.sales_person_name
  OR NEW.selling_price            IS DISTINCT FROM OLD.selling_price
  OR NEW.procurement_rate         IS DISTINCT FROM OLD.procurement_rate
  THEN
    RAISE EXCEPTION 'Only admin, sales manager, or finance can modify financial, attribution, or escalation fields on orders.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_orders_sensitive_updates ON public.orders;
CREATE TRIGGER trg_guard_orders_sensitive_updates
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_orders_sensitive_updates();

-- =========================================================
-- 4) pipeline_orders: block sales from editing valuation/ownership fields
-- =========================================================
CREATE OR REPLACE FUNCTION public.guard_pipeline_orders_sensitive_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(uid, 'admin') OR public.has_role(uid, 'sales_manager') THEN
    RETURN NEW;
  END IF;

  IF NEW.probability        IS DISTINCT FROM OLD.probability
  OR NEW.status             IS DISTINCT FROM OLD.status
  OR NEW.expected_price     IS DISTINCT FROM OLD.expected_price
  OR NEW.lost_reason        IS DISTINCT FROM OLD.lost_reason
  OR NEW.sales_person_id    IS DISTINCT FROM OLD.sales_person_id
  OR NEW.sales_person_name  IS DISTINCT FROM OLD.sales_person_name
  THEN
    RAISE EXCEPTION 'Only admin or sales manager can modify valuation or ownership fields on pipeline_orders.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pipeline_orders_sensitive_updates ON public.pipeline_orders;
CREATE TRIGGER trg_guard_pipeline_orders_sensitive_updates
  BEFORE UPDATE ON public.pipeline_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_pipeline_orders_sensitive_updates();

-- =========================================================
-- 5) quotes: block sales from self-approving
-- =========================================================
CREATE OR REPLACE FUNCTION public.guard_quotes_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(uid, 'admin')
     OR public.has_role(uid, 'sales_manager')
     OR public.has_role(uid, 'finance')
  THEN
    RETURN NEW;
  END IF;

  IF NEW.approved_by       IS DISTINCT FROM OLD.approved_by
  OR NEW.approved_by_name  IS DISTINCT FROM OLD.approved_by_name
  OR NEW.approved_at       IS DISTINCT FROM OLD.approved_at
  OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected'))
  THEN
    RAISE EXCEPTION 'Only admin, sales manager, or finance can approve or reject quotes.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_quotes_self_approval ON public.quotes;
CREATE TRIGGER trg_guard_quotes_self_approval
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.guard_quotes_self_approval();