
-- Storage bucket for HR documents
INSERT INTO storage.buckets (id, name, public) VALUES ('hr-documents', 'hr-documents', false);

-- HR Folders table
CREATE TABLE public.hr_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.hr_folders(id) ON DELETE CASCADE,
  folder_type TEXT NOT NULL DEFAULT 'general',
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_folders ENABLE ROW LEVEL SECURITY;

-- HR Documents table
CREATE TABLE public.hr_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID REFERENCES public.hr_folders(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  uploaded_by UUID NOT NULL,
  uploaded_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_documents ENABLE ROW LEVEL SECURITY;

-- Triggers for updated_at
CREATE TRIGGER update_hr_folders_updated_at
BEFORE UPDATE ON public.hr_folders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_hr_documents_updated_at
BEFORE UPDATE ON public.hr_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper function to check if user has HR or Admin role
CREATE OR REPLACE FUNCTION public.is_hr_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('hr', 'admin')
  )
$$;

-- RLS for hr_folders
-- HR/Admin: full access
CREATE POLICY "HR/Admin can manage all folders"
ON public.hr_folders FOR ALL
TO authenticated
USING (public.is_hr_or_admin(auth.uid()))
WITH CHECK (public.is_hr_or_admin(auth.uid()));

-- Employees: can view HR Policies folders and their own employee folders
CREATE POLICY "Employees can view accessible folders"
ON public.hr_folders FOR SELECT
TO authenticated
USING (
  folder_type = 'hr_policies'
  OR (folder_type = 'employee_personal' AND employee_id IN (
    SELECT id FROM public.employees WHERE user_id = auth.uid()
  ))
);

-- RLS for hr_documents
-- HR/Admin: full access
CREATE POLICY "HR/Admin can manage all documents"
ON public.hr_documents FOR ALL
TO authenticated
USING (public.is_hr_or_admin(auth.uid()))
WITH CHECK (public.is_hr_or_admin(auth.uid()));

-- Employees: can view documents in folders they have access to
CREATE POLICY "Employees can view accessible documents"
ON public.hr_documents FOR SELECT
TO authenticated
USING (
  folder_id IN (
    SELECT id FROM public.hr_folders
    WHERE folder_type = 'hr_policies'
    OR (folder_type = 'employee_personal' AND employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    ))
  )
);

-- Storage policies for hr-documents bucket
CREATE POLICY "HR/Admin can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'hr-documents' AND public.is_hr_or_admin(auth.uid()));

CREATE POLICY "HR/Admin can update documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'hr-documents' AND public.is_hr_or_admin(auth.uid()));

CREATE POLICY "HR/Admin can delete documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'hr-documents' AND public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Authenticated users can view hr documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'hr-documents' AND is_user_approved(auth.uid()));
