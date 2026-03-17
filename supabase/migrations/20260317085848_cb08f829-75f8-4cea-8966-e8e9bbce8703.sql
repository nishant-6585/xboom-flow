
-- Training Assignments
CREATE TABLE public.training_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  training_title TEXT NOT NULL,
  description TEXT,
  assigned_by UUID NOT NULL,
  assigned_by_name TEXT NOT NULL,
  assigned_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'overdue')),
  completed_at TIMESTAMP WITH TIME ZONE,
  last_accessed TIMESTAMP WITH TIME ZONE,
  progress_percentage NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Training Resources
CREATE TABLE public.training_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  training_assignment_id UUID NOT NULL REFERENCES public.training_assignments(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('youtube', 'zoom', 'gmeet', 'upload_video', 'document', 'link', 'note')),
  title TEXT NOT NULL,
  url_or_file_path TEXT,
  description TEXT,
  thumbnail_url TEXT,
  resource_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Training Resource Tracking
CREATE TABLE public.training_resource_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  training_assignment_id UUID NOT NULL REFERENCES public.training_assignments(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES public.training_resources(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  is_viewed BOOLEAN NOT NULL DEFAULT false,
  viewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(resource_id, employee_id)
);

-- Enable RLS
ALTER TABLE public.training_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_resource_tracking ENABLE ROW LEVEL SECURITY;

-- RLS: training_assignments
CREATE POLICY "HR/Admin can manage all training assignments"
ON public.training_assignments FOR ALL
USING (public.is_hr_or_admin(auth.uid()))
WITH CHECK (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Employees can view their own training assignments"
ON public.training_assignments FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

CREATE POLICY "Employees can update their own assignment progress"
ON public.training_assignments FOR UPDATE
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
)
WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

-- RLS: training_resources
CREATE POLICY "HR/Admin can manage training resources"
ON public.training_resources FOR ALL
USING (public.is_hr_or_admin(auth.uid()))
WITH CHECK (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Employees can view resources for their assignments"
ON public.training_resources FOR SELECT
USING (
  training_assignment_id IN (
    SELECT id FROM public.training_assignments
    WHERE employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  )
);

-- RLS: training_resource_tracking
CREATE POLICY "HR/Admin can view all tracking"
ON public.training_resource_tracking FOR SELECT
USING (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Employees can manage their own tracking"
ON public.training_resource_tracking FOR ALL
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
)
WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

-- Triggers for updated_at
CREATE TRIGGER update_training_assignments_updated_at
BEFORE UPDATE ON public.training_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for training uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('training-uploads', 'training-uploads', false);

CREATE POLICY "Authenticated users can upload training files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'training-uploads');

CREATE POLICY "Authenticated users can view training files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'training-uploads');

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.training_assignments;
