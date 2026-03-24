
ALTER TABLE public.employee_checklist_items
ADD COLUMN is_applicable boolean NOT NULL DEFAULT true;
