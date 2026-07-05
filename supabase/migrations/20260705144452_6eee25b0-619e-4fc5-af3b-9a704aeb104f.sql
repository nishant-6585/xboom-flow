
-- ============================================================
-- Column-level guardrails for employees / orders / pipeline_orders
-- RLS is row-scoped, not column-scoped. Add BEFORE UPDATE triggers
-- that block self-service edits to sensitive HR/financial fields
-- unless the caller has the appropriate privileged role.
-- ============================================================

-- Employees: block self-updates to salary, banking, PAN, employment,
-- designation, manager, shift fields. HR/admin bypass.
CREATE OR REPLACE FUNCTION public.guard_employees_sensitive_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean := public.is_hr_or_admin(auth.uid());
BEGIN
  -- Service-role / superuser context has no auth.uid(); allow those paths.
  IF auth.uid() IS NULL OR is_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.monthly_salary   IS DISTINCT FROM OLD.monthly_salary
  OR NEW.bank_account     IS DISTINCT FROM OLD.bank_account
  OR NEW.ifsc_code        IS DISTINCT FROM OLD.ifsc_code
  OR NEW.pan_number       IS DISTINCT FROM OLD.pan_number
  OR NEW.employment_status IS DISTINCT FROM OLD.employment_status
  OR NEW.designation      IS DISTINCT FROM OLD.designation
  OR NEW.manager_id       IS DISTINCT FROM OLD.manager_id
  OR NEW.shift_type       IS DISTINCT FROM OLD.shift_type
  OR NEW.shift_start_time IS DISTINCT FROM OLD.shift_start_time
  OR NEW.shift_end_time   IS DISTINCT FROM OLD.shift_end_time
  OR NEW.department       IS DISTINCT FROM OLD.department
  OR NEW.role             IS DISTINCT FROM OLD.role
  OR NEW.employee_number  IS DISTINCT FROM OLD.employee_number
  OR NEW.employee_type    IS DISTINCT FROM OLD.employee_type
  OR NEW.tax_regime       IS DISTINCT FROM OLD.tax_regime
  OR NEW.joining_date     IS DISTINCT FROM OLD.joining_date
  OR NEW.exit_date        IS DISTINCT FROM OLD.exit_date
  OR NEW.is_active        IS DISTINCT FROM OLD.is_active
  OR NEW.xboom_email      IS DISTINCT FROM OLD.xboom_email
  THEN
    RAISE EXCEPTION 'Only HR or admin can modify salary, banking, PAN, employment, designation, manager, or shift fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_employees_sensitive_update ON public.employees;
CREATE TRIGGER trg_guard_employees_sensitive_update
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.guard_employees_sensitive_update();

-- Orders: block sales reps from editing financial fields on their own orders.
-- Admin / finance / sales_manager / supply_chain can still edit these.
CREATE OR REPLACE FUNCTION public.guard_orders_financial_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_privileged boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  is_privileged :=
       public.has_role(uid, 'admin'::app_role)
    OR public.has_role(uid, 'finance'::app_role)
    OR public.has_role(uid, 'sales_manager'::app_role)
    OR public.has_role(uid, 'supply_chain'::app_role);

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- At this point caller is a regular sales user editing their own order.
  IF NEW.total_sales_amount IS DISTINCT FROM OLD.total_sales_amount
  OR NEW.selling_price      IS DISTINCT FROM OLD.selling_price
  OR NEW.discount_amount    IS DISTINCT FROM OLD.discount_amount
  OR NEW.amount_paid        IS DISTINCT FROM OLD.amount_paid
  OR NEW.payment_status     IS DISTINCT FROM OLD.payment_status
  OR NEW.payment_due_date   IS DISTINCT FROM OLD.payment_due_date
  OR NEW.sales_person_id    IS DISTINCT FROM OLD.sales_person_id
  THEN
    RAISE EXCEPTION 'Sales reps cannot modify financial terms (total, selling price, discount, amount paid, payment status/due date) or reassign ownership on their own orders. Ask admin, finance, or a sales manager.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_orders_financial_update ON public.orders;
CREATE TRIGGER trg_guard_orders_financial_update
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_orders_financial_update();

-- Pipeline orders: block sales reps from editing pricing/probability on
-- their own deals. Admin / sales_manager can still edit.
CREATE OR REPLACE FUNCTION public.guard_pipeline_orders_sensitive_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_privileged boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  is_privileged :=
       public.has_role(uid, 'admin'::app_role)
    OR public.has_role(uid, 'sales_manager'::app_role)
    OR public.has_role(uid, 'finance'::app_role);

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.expected_price IS DISTINCT FROM OLD.expected_price
  OR NEW.probability    IS DISTINCT FROM OLD.probability
  OR NEW.sales_person_id IS DISTINCT FROM OLD.sales_person_id
  THEN
    RAISE EXCEPTION 'Sales reps cannot modify expected price, probability, or ownership on their own pipeline deals. Ask a sales manager.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pipeline_orders_sensitive_update ON public.pipeline_orders;
CREATE TRIGGER trg_guard_pipeline_orders_sensitive_update
BEFORE UPDATE ON public.pipeline_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_pipeline_orders_sensitive_update();
