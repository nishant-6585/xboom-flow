
-- Process documents table
CREATE TABLE public.hr_process_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hr_process_documents_category ON public.hr_process_documents(category);
CREATE INDEX idx_hr_process_documents_active ON public.hr_process_documents(is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_process_documents TO authenticated;
GRANT ALL ON public.hr_process_documents TO service_role;

ALTER TABLE public.hr_process_documents ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active docs; HR/Admin can read all
CREATE POLICY "Employees can view active process docs"
ON public.hr_process_documents FOR SELECT TO authenticated
USING (
  is_active = true
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
);

-- Only HR/Admin can write
CREATE POLICY "HR/Admin can insert process docs"
ON public.hr_process_documents FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
);

CREATE POLICY "HR/Admin can update process docs"
ON public.hr_process_documents FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
);

CREATE POLICY "HR/Admin can delete process docs"
ON public.hr_process_documents FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
);

-- updated_at trigger
CREATE TRIGGER trg_hr_process_documents_updated_at
BEFORE UPDATE ON public.hr_process_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies on the hr-process-docs bucket
CREATE POLICY "Authenticated can read hr-process-docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'hr-process-docs');

CREATE POLICY "HR/Admin can upload hr-process-docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'hr-process-docs'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr'::app_role))
);

CREATE POLICY "HR/Admin can update hr-process-docs"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'hr-process-docs'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr'::app_role))
);

CREATE POLICY "HR/Admin can delete hr-process-docs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'hr-process-docs'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr'::app_role))
);
