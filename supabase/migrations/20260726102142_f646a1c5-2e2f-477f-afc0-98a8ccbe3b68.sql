-- ============================================================
-- 1) employee_kpi_progress: block self-approval on insert
-- ============================================================
DROP POLICY IF EXISTS "Employees can insert progress on their KPIs" ON public.employee_kpi_progress;

CREATE POLICY "Employees can insert progress on their KPIs"
ON public.employee_kpi_progress
FOR INSERT
TO authenticated
WITH CHECK (
  kpi_id IN (
    SELECT ek.id
    FROM public.employee_kpis ek
    JOIN public.employees e ON e.id = ek.employee_id
    WHERE e.user_id = auth.uid()
  )
  AND (
    is_hr_or_admin(auth.uid())
    OR (
      COALESCE(approval_status, 'pending') = 'pending'
      AND approved_by IS NULL
      AND approved_at IS NULL
    )
  )
);

-- ============================================================
-- 2) employee_kpis: block self-created inflation
-- ============================================================
DROP POLICY IF EXISTS "Employees can create their own KPIs" ON public.employee_kpis;

CREATE POLICY "Employees can create their own KPIs"
ON public.employee_kpis
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_kpis.employee_id AND e.user_id = auth.uid()
  )
  AND kpi_source = 'employee'::kpi_source
  AND COALESCE(achievement_percentage, 0) = 0
  AND COALESCE(achieved_value, 0) = 0
  AND COALESCE(status::text, 'not_started') IN ('not_started','pending')
  AND COALESCE(workflow_status::text, 'draft') IN ('draft','pending')
);

-- Also lock those fields on self-update so employees can't flip status/percent afterwards
CREATE OR REPLACE FUNCTION public.employee_kpis_self_update_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF is_hr_or_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.achievement_percentage IS DISTINCT FROM OLD.achievement_percentage
     OR NEW.achieved_value IS DISTINCT FROM OLD.achieved_value
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.workflow_status IS DISTINCT FROM OLD.workflow_status
     OR NEW.kpi_source IS DISTINCT FROM OLD.kpi_source
     OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
  THEN
    RAISE EXCEPTION 'Only HR/Admin can modify KPI achievement, status, workflow_status, or ownership fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_kpis_self_update_check ON public.employee_kpis;
CREATE TRIGGER trg_employee_kpis_self_update_check
BEFORE UPDATE ON public.employee_kpis
FOR EACH ROW EXECUTE FUNCTION public.employee_kpis_self_update_check();

-- ============================================================
-- 3) resignation_requests: force pending on self-insert
-- ============================================================
DROP POLICY IF EXISTS resignation_requests_insert ON public.resignation_requests;

CREATE POLICY resignation_requests_insert
ON public.resignation_requests
FOR INSERT
TO authenticated
WITH CHECK (
  is_hr_or_admin(auth.uid())
  OR (
    user_id = auth.uid()
    AND COALESCE(status, 'pending') = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_by_name IS NULL
    AND reviewed_at IS NULL
    AND approved_lwd IS NULL
  )
);

-- ============================================================
-- 4) invoices: lock financial/signature fields on owner update
-- ============================================================
CREATE OR REPLACE FUNCTION public.invoices_self_update_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'finance'::app_role)
     OR has_role(auth.uid(), 'sales_manager'::app_role)
  THEN
    RETURN NEW;
  END IF;

  -- Non-privileged owners (created_by/signed_by/submitted_by) cannot alter
  -- financial, signature, PDF, hash, status, or approval-related fields.
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.total_gst IS DISTINCT FROM OLD.total_gst
     OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
     OR NEW.discount_percent IS DISTINCT FROM OLD.discount_percent
     OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
     OR NEW.balance_due IS DISTINCT FROM OLD.balance_due
     OR NEW.paid_date IS DISTINCT FROM OLD.paid_date
     OR NEW.signed_by IS DISTINCT FROM OLD.signed_by
     OR NEW.signed_by_name IS DISTINCT FROM OLD.signed_by_name
     OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
     OR NEW.signature_url IS DISTINCT FROM OLD.signature_url
     OR NEW.pdf_url IS DISTINCT FROM OLD.pdf_url
     OR NEW.invoice_hash IS DISTINCT FROM OLD.invoice_hash
     OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_by_name IS DISTINCT FROM OLD.created_by_name
     OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
     OR NEW.submitted_by_name IS DISTINCT FROM OLD.submitted_by_name
     OR NEW.submitted_for_signature_at IS DISTINCT FROM OLD.submitted_for_signature_at
  THEN
    RAISE EXCEPTION 'Only Admin, Finance, or Sales Manager can modify invoice financial, signature, or approval fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_self_update_check ON public.invoices;
CREATE TRIGGER trg_invoices_self_update_check
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.invoices_self_update_check();