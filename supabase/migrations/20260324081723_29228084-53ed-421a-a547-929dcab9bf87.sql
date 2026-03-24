DROP TRIGGER IF EXISTS trg_update_checklist_completion ON public.employee_checklist_items;

DROP FUNCTION IF EXISTS public.update_checklist_completion();

CREATE OR REPLACE FUNCTION public.recalculate_checklist_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_checklist_id UUID;
  v_total_applicable INT;
  v_completed_applicable INT;
  v_pct INT;
  v_status TEXT;
BEGIN
  v_checklist_id := COALESCE(NEW.checklist_id, OLD.checklist_id);

  SELECT
    COUNT(*) FILTER (WHERE is_applicable = true),
    COUNT(*) FILTER (WHERE is_applicable = true AND is_completed = true)
  INTO v_total_applicable, v_completed_applicable
  FROM public.employee_checklist_items
  WHERE checklist_id = v_checklist_id;

  IF v_total_applicable = 0 THEN
    v_pct := 100;
    v_status := 'completed';
  ELSIF v_completed_applicable = v_total_applicable THEN
    v_pct := 100;
    v_status := 'completed';
  ELSIF v_completed_applicable > 0 THEN
    v_pct := ROUND((v_completed_applicable::NUMERIC / v_total_applicable) * 100);
    v_status := 'in_progress';
  ELSE
    v_pct := 0;
    v_status := 'not_started';
  END IF;

  UPDATE public.employee_checklists
  SET completion_percentage = v_pct,
      status = v_status,
      updated_at = now()
  WHERE id = v_checklist_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_checklist_progress ON public.employee_checklist_items;

CREATE TRIGGER trg_recalculate_checklist_progress
AFTER INSERT OR UPDATE OR DELETE ON public.employee_checklist_items
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_checklist_progress();