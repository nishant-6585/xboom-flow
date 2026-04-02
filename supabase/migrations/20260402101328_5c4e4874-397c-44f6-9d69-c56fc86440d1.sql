
-- Template Library: reusable templates not tied to one employee
CREATE TABLE public.flow_template_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'General',
  total_duration_mins INTEGER DEFAULT 0,
  task_count INTEGER DEFAULT 0,
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.flow_template_library_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  library_template_id UUID NOT NULL REFERENCES public.flow_template_library(id) ON DELETE CASCADE,
  sl_no INTEGER NOT NULL,
  description TEXT NOT NULL,
  sub_items TEXT[] DEFAULT '{}',
  time_from TEXT NOT NULL,
  time_to TEXT NOT NULL,
  duration_mins INTEGER NOT NULL DEFAULT 0,
  target_value INTEGER DEFAULT 0,
  is_break BOOLEAN DEFAULT false,
  frequency TEXT DEFAULT 'daily',
  frequency_days TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.flow_template_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_template_library_items ENABLE ROW LEVEL SECURITY;

-- RLS: Admin/HR can manage; all authenticated can view
CREATE POLICY "Authenticated users can view template library"
  ON public.flow_template_library FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin/HR can manage template library"
  ON public.flow_template_library FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')
  );

CREATE POLICY "Authenticated users can view template library items"
  ON public.flow_template_library_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin/HR can manage template library items"
  ON public.flow_template_library_items FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')
  );
