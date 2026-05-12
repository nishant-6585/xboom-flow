-- Add 'Pen' to onboarding checklist templates
INSERT INTO public.checklist_templates (checklist_type, item_name, item_order)
SELECT 'onboarding', 'Pen', 26
WHERE NOT EXISTS (
  SELECT 1 FROM public.checklist_templates 
  WHERE checklist_type = 'onboarding' AND item_name = 'Pen'
);
