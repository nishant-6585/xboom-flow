CREATE OR REPLACE FUNCTION public.guard_training_assignment_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_hr_or_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

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
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
     OR NEW.progress_percentage IS DISTINCT FROM OLD.progress_percentage
  THEN
    RAISE EXCEPTION 'employees may only update last_accessed on their own training assignments; status/completion must be recorded by HR/Admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.training_assignment_self_update_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF is_hr_or_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.employee_id      IS DISTINCT FROM OLD.employee_id
     OR NEW.training_id    IS DISTINCT FROM OLD.training_id
     OR NEW.training_title IS DISTINCT FROM OLD.training_title
     OR NEW.description    IS DISTINCT FROM OLD.description
     OR NEW.assigned_by    IS DISTINCT FROM OLD.assigned_by
     OR NEW.assigned_by_name IS DISTINCT FROM OLD.assigned_by_name
     OR NEW.assigned_date  IS DISTINCT FROM OLD.assigned_date
     OR NEW.due_date       IS DISTINCT FROM OLD.due_date
     OR NEW.priority       IS DISTINCT FROM OLD.priority
     OR NEW.created_at     IS DISTINCT FROM OLD.created_at
     OR NEW.status              IS DISTINCT FROM OLD.status
     OR NEW.completed_at        IS DISTINCT FROM OLD.completed_at
     OR NEW.progress_percentage IS DISTINCT FROM OLD.progress_percentage
  THEN
    RAISE EXCEPTION 'employees may only update last_accessed on their own training assignments; status/completion must be recorded by HR/Admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;