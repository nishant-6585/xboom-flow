-- Add 'Pen' to all existing employee onboarding checklists that don't already have it
DO $$
DECLARE
  v_pen_template_id UUID;
  v_checklist RECORD;
BEGIN
  -- Get the 'Pen' template id
  SELECT id INTO v_pen_template_id
  FROM public.checklist_templates
  WHERE checklist_type = 'onboarding' AND item_name = 'Pen';

  -- If template exists, add to all existing onboarding checklists
  IF v_pen_template_id IS NOT NULL THEN
    FOR v_checklist IN
      SELECT ec.id AS checklist_id
      FROM public.employee_checklists ec
      WHERE ec.checklist_type = 'onboarding'
        AND NOT EXISTS (
          SELECT 1 FROM public.employee_checklist_items eci
          WHERE eci.checklist_id = ec.id AND eci.item_name = 'Pen'
        )
    LOOP
      INSERT INTO public.employee_checklist_items (
        checklist_id, template_item_id, item_name, item_order
      ) VALUES (
        v_checklist.checklist_id, v_pen_template_id, 'Pen', 26
      );
    END LOOP;
  END IF;
END $$;
