-- 1. employee_kpi_progress: add approval workflow
ALTER TABLE public.employee_kpi_progress
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Backfill: existing rows are considered approved to preserve historical KPI values
UPDATE public.employee_kpi_progress
  SET approval_status = 'approved'
  WHERE approval_status = 'pending' AND created_at < now();

-- BEFORE INSERT/UPDATE guard: only HR/Admin can set approval_status to approved/rejected
-- and only HR/Admin can change approval fields on UPDATE
CREATE OR REPLACE FUNCTION public.guard_employee_kpi_progress_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_privileged boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_privileged := public.is_hr_or_admin(v_uid);

  IF TG_OP = 'INSERT' THEN
    IF NOT v_privileged THEN
      -- Force non-HR/Admin submissions to pending; ignore any client-supplied values
      NEW.approval_status := 'pending';
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    ELSE
      -- HR/Admin insertions auto-approve
      IF NEW.approval_status IS NULL OR NEW.approval_status = 'pending' THEN
        NEW.approval_status := 'approved';
        NEW.approved_by := COALESCE(NEW.approved_by, v_uid);
        NEW.approved_at := COALESCE(NEW.approved_at, now());
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT v_privileged THEN
      -- Non-privileged users cannot change approval fields
      NEW.approval_status := OLD.approval_status;
      NEW.approved_by := OLD.approved_by;
      NEW.approved_at := OLD.approved_at;
    ELSE
      IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
         AND NEW.approval_status IN ('approved','rejected') THEN
        NEW.approved_by := COALESCE(NEW.approved_by, v_uid);
        NEW.approved_at := COALESCE(NEW.approved_at, now());
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_employee_kpi_progress_approval ON public.employee_kpi_progress;
CREATE TRIGGER trg_guard_employee_kpi_progress_approval
  BEFORE INSERT OR UPDATE ON public.employee_kpi_progress
  FOR EACH ROW EXECUTE FUNCTION public.guard_employee_kpi_progress_approval();

-- Update the KPI sync trigger to only apply approved progress rows
CREATE OR REPLACE FUNCTION public.update_kpi_on_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target NUMERIC;
  v_green NUMERIC;
  v_amber NUMERIC;
  v_due DATE;
  v_pct NUMERIC;
  v_status kpi_rag_status;
BEGIN
  -- Only approved progress affects the parent KPI's achievement/RAG
  IF COALESCE(NEW.approval_status, 'pending') <> 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT target_value, green_threshold, amber_threshold, due_date
  INTO v_target, v_green, v_amber, v_due
  FROM public.employee_kpis
  WHERE id = NEW.kpi_id;

  IF v_target > 0 THEN
    v_pct := (NEW.achieved_value / v_target) * 100;
  ELSE
    v_pct := 0;
  END IF;

  IF v_pct >= v_green THEN
    v_status := 'green';
  ELSIF v_pct >= v_amber THEN
    v_status := 'amber';
  ELSIF CURRENT_DATE > v_due THEN
    v_status := 'red';
  ELSE
    v_status := 'amber';
  END IF;

  UPDATE public.employee_kpis
  SET achieved_value = NEW.achieved_value,
      achievement_percentage = v_pct,
      status = v_status,
      updated_at = now()
  WHERE id = NEW.kpi_id;

  RETURN NEW;
END;
$$;

-- Also fire the sync on UPDATE (when HR flips approval_status to approved)
DROP TRIGGER IF EXISTS trigger_update_kpi_on_progress_update ON public.employee_kpi_progress;
CREATE TRIGGER trigger_update_kpi_on_progress_update
  AFTER UPDATE ON public.employee_kpi_progress
  FOR EACH ROW
  WHEN (OLD.approval_status IS DISTINCT FROM NEW.approval_status AND NEW.approval_status = 'approved')
  EXECUTE FUNCTION public.update_kpi_on_progress();

-- 2. sales_daily_activities: extend guard to orders_won + pipeline_created
CREATE OR REPLACE FUNCTION public.protect_sales_activity_bonus_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_privileged boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_privileged := public.has_role(v_uid,'admin'::app_role)
               OR public.has_role(v_uid,'finance'::app_role);

  IF v_privileged THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.bonus_earned           := 0;
    NEW.payment_expected_today := 0;
    NEW.sweet_pipeline         := 0;
    NEW.monthly_pipeline       := 0;
    NEW.orders_won             := 0;
    NEW.pipeline_created       := 0;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.bonus_earned           := OLD.bonus_earned;
    NEW.payment_expected_today := OLD.payment_expected_today;
    NEW.sweet_pipeline         := OLD.sweet_pipeline;
    NEW.monthly_pipeline       := OLD.monthly_pipeline;
    NEW.orders_won             := OLD.orders_won;
    NEW.pipeline_created       := OLD.pipeline_created;
  END IF;

  RETURN NEW;
END;
$$;