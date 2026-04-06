
-- Create drone_operations table
CREATE TABLE public.drone_operations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  activity_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('Demo', 'Training', 'Field Work')),
  project_name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  location TEXT,
  equipment_used JSONB DEFAULT '[]'::jsonb,
  team_members UUID[] DEFAULT '{}',
  work_description TEXT,
  status TEXT NOT NULL DEFAULT 'Planned' CHECK (status IN ('Planned', 'In Progress', 'Completed', 'Cancelled')),
  report_file_url TEXT,
  remarks TEXT
);

-- Indexes
CREATE INDEX idx_drone_operations_activity_datetime ON public.drone_operations(activity_datetime);
CREATE INDEX idx_drone_operations_activity_type ON public.drone_operations(activity_type);
CREATE INDEX idx_drone_operations_status ON public.drone_operations(status);

-- Enable RLS
ALTER TABLE public.drone_operations ENABLE ROW LEVEL SECURITY;

-- Admin, Supply Chain, HR → full access
CREATE POLICY "drone_ops_full_access" ON public.drone_operations
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'supply_chain'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'supply_chain'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
  );

-- Others → read-only
CREATE POLICY "drone_ops_read_only" ON public.drone_operations
  FOR SELECT
  TO authenticated
  USING (public.is_user_approved(auth.uid()));

-- Updated_at trigger
CREATE TRIGGER set_drone_operations_updated_at
  BEFORE UPDATE ON public.drone_operations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('drone-operation-reports', 'drone-operation-reports', false);

-- Storage RLS: Admin + Supply Chain can upload
CREATE POLICY "drone_reports_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'drone-operation-reports'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'supply_chain'::app_role)
    )
  );

-- Storage RLS: Authenticated can view/download
CREATE POLICY "drone_reports_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'drone-operation-reports'
    AND public.is_user_approved(auth.uid())
  );

-- Storage RLS: Admin + Supply Chain can delete
CREATE POLICY "drone_reports_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'drone-operation-reports'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'supply_chain'::app_role)
    )
  );
