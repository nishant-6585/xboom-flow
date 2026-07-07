
-- ============================================================
-- 1) attendance_logs: guard employee self-inserts against backdating
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_attendance_self_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  now_ts        timestamptz := now();
  past_window   interval    := interval '24 hours';
  future_window interval    := interval '15 minutes';
BEGIN
  -- HR and Admin can insert any timestamps (retroactive corrections etc.)
  IF public.is_hr_or_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Employee self-insert must be for their own employee row (RLS already
  -- enforces this) and stay inside the server-time window.
  IF NEW.check_in_time IS NOT NULL AND
     (NEW.check_in_time > now_ts + future_window
      OR NEW.check_in_time < now_ts - past_window) THEN
    RAISE EXCEPTION 'attendance check_in_time is outside the allowed self-service window'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.check_out_time IS NOT NULL AND
     (NEW.check_out_time > now_ts + future_window
      OR NEW.check_out_time < now_ts - past_window) THEN
    RAISE EXCEPTION 'attendance check_out_time is outside the allowed self-service window'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.check_out_time IS NOT NULL AND NEW.check_in_time IS NOT NULL
     AND NEW.check_out_time < NEW.check_in_time THEN
    RAISE EXCEPTION 'attendance check_out_time must be after check_in_time'
      USING ERRCODE = '22023';
  END IF;

  -- Recompute working_hours from server-validated timestamps so employees
  -- cannot pad it independently of check_in/check_out.
  IF NEW.check_in_time IS NOT NULL AND NEW.check_out_time IS NOT NULL THEN
    NEW.working_hours := ROUND(
      EXTRACT(EPOCH FROM (NEW.check_out_time - NEW.check_in_time)) / 3600.0,
      2
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_attendance_self_insert ON public.attendance_logs;
CREATE TRIGGER trg_guard_attendance_self_insert
BEFORE INSERT ON public.attendance_logs
FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_self_insert();

-- ============================================================
-- 2) training_assignments: employees may only touch progress fields
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_training_assignment_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- HR and Admin can change any column.
  IF public.is_hr_or_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- For self-updates (RLS already limits row scope to own employee_id),
  -- allow only progress-tracking columns to change. Any attempt to modify
  -- assignment metadata is rejected.
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
     OR NEW.training_id IS DISTINCT FROM OLD.training_id
     OR NEW.training_title IS DISTINCT FROM OLD.training_title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
     OR NEW.assigned_by_name IS DISTINCT FROM OLD.assigned_by_name
     OR NEW.assigned_date IS DISTINCT FROM OLD.assigned_date
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.priority IS DISTINCT FROM OLD.priority
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'employees may only update progress-tracking fields on their own training assignments'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_training_assignment_self_update ON public.training_assignments;
CREATE TRIGGER trg_guard_training_assignment_self_update
BEFORE UPDATE ON public.training_assignments
FOR EACH ROW EXECUTE FUNCTION public.guard_training_assignment_self_update();
