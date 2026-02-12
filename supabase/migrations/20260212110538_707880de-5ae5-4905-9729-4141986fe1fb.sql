
-- Sharing rules for folders
CREATE TABLE public.hr_folder_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES public.hr_folders(id) ON DELETE CASCADE,
  share_type TEXT NOT NULL CHECK (share_type IN ('all', 'department', 'individual')),
  department TEXT, -- populated when share_type = 'department'
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE, -- populated when share_type = 'individual'
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sharing rules for documents
CREATE TABLE public.hr_document_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.hr_documents(id) ON DELETE CASCADE,
  share_type TEXT NOT NULL CHECK (share_type IN ('all', 'department', 'individual')),
  department TEXT,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add visibility column to folders and documents (default private)
ALTER TABLE public.hr_folders ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private';
ALTER TABLE public.hr_documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private';

-- Enable RLS
ALTER TABLE public.hr_folder_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_document_shares ENABLE ROW LEVEL SECURITY;

-- HR/Admin full access on shares
CREATE POLICY "HR/Admin full access folder shares" ON public.hr_folder_shares
  FOR ALL USING (is_hr_or_admin(auth.uid()))
  WITH CHECK (is_hr_or_admin(auth.uid()));

CREATE POLICY "HR/Admin full access document shares" ON public.hr_document_shares
  FOR ALL USING (is_hr_or_admin(auth.uid()))
  WITH CHECK (is_hr_or_admin(auth.uid()));

-- Employees can view shares relevant to them
CREATE POLICY "Employees can view folder shares" ON public.hr_folder_shares
  FOR SELECT USING (
    is_user_approved(auth.uid()) AND (
      share_type = 'all'
      OR (share_type = 'individual' AND employee_id IN (
        SELECT id FROM public.employees WHERE user_id = auth.uid()
      ))
      OR (share_type = 'department' AND department IN (
        SELECT department FROM public.employees WHERE user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Employees can view document shares" ON public.hr_document_shares
  FOR SELECT USING (
    is_user_approved(auth.uid()) AND (
      share_type = 'all'
      OR (share_type = 'individual' AND employee_id IN (
        SELECT id FROM public.employees WHERE user_id = auth.uid()
      ))
      OR (share_type = 'department' AND department IN (
        SELECT department FROM public.employees WHERE user_id = auth.uid()
      ))
    )
  );

-- Helper function to check if user can see a folder based on shares
CREATE OR REPLACE FUNCTION public.can_view_hr_folder(_user_id UUID, _folder_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    is_hr_or_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.hr_folders f WHERE f.id = _folder_id AND f.visibility = 'private' AND f.folder_type = 'hr_policies'
    ) = false -- skip private non-policy folders check, handle below
    OR EXISTS (
      SELECT 1 FROM public.hr_folder_shares fs
      WHERE fs.folder_id = _folder_id
      AND (
        fs.share_type = 'all'
        OR (fs.share_type = 'individual' AND fs.employee_id IN (SELECT id FROM public.employees WHERE user_id = _user_id))
        OR (fs.share_type = 'department' AND fs.department IN (SELECT department FROM public.employees WHERE user_id = _user_id))
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.hr_folders f 
      WHERE f.id = _folder_id 
      AND f.folder_type = 'employee_personal' 
      AND f.employee_id IN (SELECT id FROM public.employees WHERE user_id = _user_id)
    )
$$;

-- Helper function to check if user can see a document based on shares
CREATE OR REPLACE FUNCTION public.can_view_hr_document(_user_id UUID, _document_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    is_hr_or_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.hr_document_shares ds
      WHERE ds.document_id = _document_id
      AND (
        ds.share_type = 'all'
        OR (ds.share_type = 'individual' AND ds.employee_id IN (SELECT id FROM public.employees WHERE user_id = _user_id))
        OR (ds.share_type = 'department' AND ds.department IN (SELECT department FROM public.employees WHERE user_id = _user_id))
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.hr_documents d
      JOIN public.hr_folders f ON f.id = d.folder_id
      WHERE d.id = _document_id
      AND f.folder_type = 'employee_personal'
      AND f.employee_id IN (SELECT id FROM public.employees WHERE user_id = _user_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.hr_documents d
      JOIN public.hr_folder_shares fs ON fs.folder_id = d.folder_id
      WHERE d.id = _document_id
      AND (
        fs.share_type = 'all'
        OR (fs.share_type = 'individual' AND fs.employee_id IN (SELECT id FROM public.employees WHERE user_id = _user_id))
        OR (fs.share_type = 'department' AND fs.department IN (SELECT department FROM public.employees WHERE user_id = _user_id))
      )
    )
$$;

-- Update existing RLS on hr_folders: replace employee view policy
DROP POLICY IF EXISTS "Employees can view accessible folders" ON public.hr_folders;
CREATE POLICY "Employees can view accessible folders" ON public.hr_folders
  FOR SELECT USING (
    is_user_approved(auth.uid()) AND (
      is_hr_or_admin(auth.uid())
      OR can_view_hr_folder(auth.uid(), id)
    )
  );

-- Update existing RLS on hr_documents: replace employee view policy  
DROP POLICY IF EXISTS "Employees can view accessible documents" ON public.hr_documents;
CREATE POLICY "Employees can view accessible documents" ON public.hr_documents
  FOR SELECT USING (
    is_user_approved(auth.uid()) AND (
      is_hr_or_admin(auth.uid())
      OR can_view_hr_document(auth.uid(), id)
    )
  );

-- Index for performance
CREATE INDEX idx_hr_folder_shares_folder ON public.hr_folder_shares(folder_id);
CREATE INDEX idx_hr_document_shares_document ON public.hr_document_shares(document_id);
CREATE INDEX idx_hr_folder_shares_employee ON public.hr_folder_shares(employee_id);
CREATE INDEX idx_hr_document_shares_employee ON public.hr_document_shares(employee_id);
