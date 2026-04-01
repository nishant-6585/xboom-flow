
-- 1. Create master employee_trainings table
CREATE TABLE public.employee_trainings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.employee_trainings ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies
CREATE POLICY "Approved users can view employee trainings" ON public.employee_trainings
  FOR SELECT USING (is_user_approved(auth.uid()));

CREATE POLICY "HR/Admin can manage employee trainings" ON public.employee_trainings
  FOR ALL USING (is_hr_or_admin(auth.uid())) WITH CHECK (is_hr_or_admin(auth.uid()));

-- 4. Add training_id to training_assignments
ALTER TABLE public.training_assignments ADD COLUMN training_id UUID REFERENCES public.employee_trainings(id) ON DELETE CASCADE;

-- 5. Create master training_resources table (at training level, not assignment level)
CREATE TABLE public.employee_training_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  training_id UUID NOT NULL REFERENCES public.employee_trainings(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('youtube', 'zoom', 'gmeet', 'upload_video', 'document', 'link', 'note')),
  title TEXT NOT NULL,
  url_or_file_path TEXT,
  description TEXT,
  thumbnail_url TEXT,
  resource_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_training_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view employee training resources" ON public.employee_training_resources
  FOR SELECT USING (is_user_approved(auth.uid()));

CREATE POLICY "HR/Admin can manage employee training resources" ON public.employee_training_resources
  FOR ALL USING (is_hr_or_admin(auth.uid())) WITH CHECK (is_hr_or_admin(auth.uid()));

-- 6. Migrate existing data: create master trainings from distinct titles
INSERT INTO public.employee_trainings (id, title, description, priority, created_by, created_by_name, created_at)
SELECT
  gen_random_uuid(),
  ta.training_title,
  ta.description,
  ta.priority,
  ta.assigned_by,
  ta.assigned_by_name,
  MIN(ta.created_at)
FROM public.training_assignments ta
GROUP BY ta.training_title, ta.description, ta.priority, ta.assigned_by, ta.assigned_by_name;

-- 7. Link assignments to their master training
UPDATE public.training_assignments ta
SET training_id = et.id
FROM public.employee_trainings et
WHERE et.title = ta.training_title;

-- 8. Migrate resources: copy from first assignment per training to master level
INSERT INTO public.employee_training_resources (training_id, resource_type, title, url_or_file_path, description, thumbnail_url, resource_order)
SELECT DISTINCT ON (et.id, tr.resource_order)
  et.id,
  tr.resource_type,
  tr.title,
  tr.url_or_file_path,
  tr.description,
  tr.thumbnail_url,
  tr.resource_order
FROM public.training_resources tr
JOIN public.training_assignments ta ON tr.training_assignment_id = ta.id
JOIN public.employee_trainings et ON et.id = ta.training_id
ORDER BY et.id, tr.resource_order, tr.created_at;

-- 9. Update tracking to reference master resource IDs
-- Add resource reference to tracking for master resources
ALTER TABLE public.training_resource_tracking ADD COLUMN master_resource_id UUID REFERENCES public.employee_training_resources(id) ON DELETE CASCADE;

-- 10. Update updated_at trigger
CREATE TRIGGER update_employee_trainings_updated_at BEFORE UPDATE ON public.employee_trainings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 11. Make training_id NOT NULL after migration
ALTER TABLE public.training_assignments ALTER COLUMN training_id SET NOT NULL;

-- 12. Add realtime for employee_trainings
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_trainings;
