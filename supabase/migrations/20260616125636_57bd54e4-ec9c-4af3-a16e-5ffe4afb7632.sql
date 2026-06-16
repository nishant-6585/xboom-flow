
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.kyc_status AS ENUM (
    'not_submitted','pending_verification','approved','rejected','resubmission_required'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.kyc_doc_type AS ENUM (
    'aadhaar','pan','gst','business_registration','address_proof'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ PORTAL ACCOUNTS: KYC fields ============
ALTER TABLE public.portal_accounts
  ADD COLUMN IF NOT EXISTS kyc_status public.kyc_status NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS aadhaar_last4 varchar(4),
  ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS kyc_rejection_reason text;

-- ============ KYC DOCUMENTS ============
CREATE TABLE IF NOT EXISTS public.kyc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.portal_accounts(id) ON DELETE CASCADE,
  doc_type public.kyc_doc_type NOT NULL DEFAULT 'aadhaar',
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size_bytes bigint NOT NULL,
  mime_type text,
  status public.kyc_status NOT NULL DEFAULT 'pending_verification',
  rejection_reason text,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  version int NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kyc_documents_account_idx ON public.kyc_documents(account_id, doc_type, is_current);
CREATE INDEX IF NOT EXISTS kyc_documents_status_idx ON public.kyc_documents(status);

GRANT SELECT, INSERT, UPDATE ON public.kyc_documents TO authenticated;
GRANT ALL ON public.kyc_documents TO service_role;
ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;

-- ============ KYC SENSITIVE DATA (staff-only) ============
CREATE TABLE IF NOT EXISTS public.kyc_sensitive_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.portal_accounts(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.kyc_documents(id) ON DELETE SET NULL,
  aadhaar_full text NOT NULL CHECK (aadhaar_full ~ '^\d{12}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kyc_sensitive_account_idx ON public.kyc_sensitive_data(account_id);

-- staff-only: no grants to authenticated; reads go through SECURITY DEFINER fn
GRANT ALL ON public.kyc_sensitive_data TO service_role;
ALTER TABLE public.kyc_sensitive_data ENABLE ROW LEVEL SECURITY;

-- ============ KYC AUDIT LOG ============
CREATE TABLE IF NOT EXISTS public.kyc_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.portal_accounts(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.kyc_documents(id) ON DELETE SET NULL,
  action text NOT NULL,
  actor_id uuid,
  actor_role text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kyc_audit_account_idx ON public.kyc_audit_log(account_id, created_at DESC);

GRANT SELECT, INSERT ON public.kyc_audit_log TO authenticated;
GRANT ALL ON public.kyc_audit_log TO service_role;
ALTER TABLE public.kyc_audit_log ENABLE ROW LEVEL SECURITY;

-- ============ updated_at trigger ============
DROP TRIGGER IF EXISTS trg_kyc_docs_updated_at ON public.kyc_documents;
CREATE TRIGGER trg_kyc_docs_updated_at
  BEFORE UPDATE ON public.kyc_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ HELPER: resolve current portal contact's account id ============
CREATE OR REPLACE FUNCTION public.get_my_portal_account_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT account_id FROM public.portal_contacts
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_portal_account_id() TO authenticated;

-- ============ HELPER: staff KYC reviewer check ============
CREATE OR REPLACE FUNCTION public.is_kyc_reviewer(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid
      AND role IN ('admin','finance','sales','sales_manager')
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_kyc_reviewer(uuid) TO authenticated;

-- ============ RLS: kyc_documents ============
DROP POLICY IF EXISTS kyc_docs_select ON public.kyc_documents;
CREATE POLICY kyc_docs_select ON public.kyc_documents
  FOR SELECT TO authenticated
  USING (
    account_id = public.get_my_portal_account_id()
    OR public.is_kyc_reviewer(auth.uid())
  );

DROP POLICY IF EXISTS kyc_docs_insert ON public.kyc_documents;
CREATE POLICY kyc_docs_insert ON public.kyc_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    account_id = public.get_my_portal_account_id()
    OR public.is_kyc_reviewer(auth.uid())
  );

DROP POLICY IF EXISTS kyc_docs_update ON public.kyc_documents;
CREATE POLICY kyc_docs_update ON public.kyc_documents
  FOR UPDATE TO authenticated
  USING (public.is_kyc_reviewer(auth.uid()))
  WITH CHECK (public.is_kyc_reviewer(auth.uid()));

-- ============ RLS: kyc_audit_log ============
DROP POLICY IF EXISTS kyc_audit_select ON public.kyc_audit_log;
CREATE POLICY kyc_audit_select ON public.kyc_audit_log
  FOR SELECT TO authenticated
  USING (
    account_id = public.get_my_portal_account_id()
    OR public.is_kyc_reviewer(auth.uid())
  );

DROP POLICY IF EXISTS kyc_audit_insert ON public.kyc_audit_log;
CREATE POLICY kyc_audit_insert ON public.kyc_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    account_id = public.get_my_portal_account_id()
    OR public.is_kyc_reviewer(auth.uid())
  );

-- ============ RLS: kyc_sensitive_data (staff only via SECURITY DEFINER fn) ============
DROP POLICY IF EXISTS kyc_sensitive_no_access ON public.kyc_sensitive_data;
CREATE POLICY kyc_sensitive_no_access ON public.kyc_sensitive_data
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.get_kyc_aadhaar_full(_account_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_full text;
BEGIN
  IF NOT public.is_kyc_reviewer(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  SELECT aadhaar_full INTO v_full
  FROM public.kyc_sensitive_data
  WHERE account_id = _account_id
  ORDER BY created_at DESC LIMIT 1;
  RETURN v_full;
END $$;
GRANT EXECUTE ON FUNCTION public.get_kyc_aadhaar_full(uuid) TO authenticated;

-- ============ STORAGE RLS for 'kyc-documents' bucket ============
-- Customers: own folder = first path segment matches their account id
DROP POLICY IF EXISTS "kyc storage customer read own" ON storage.objects;
CREATE POLICY "kyc storage customer read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1]::uuid = public.get_my_portal_account_id()
  );

DROP POLICY IF EXISTS "kyc storage customer upload own" ON storage.objects;
CREATE POLICY "kyc storage customer upload own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1]::uuid = public.get_my_portal_account_id()
  );

DROP POLICY IF EXISTS "kyc storage staff read all" ON storage.objects;
CREATE POLICY "kyc storage staff read all" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND public.is_kyc_reviewer(auth.uid())
  );
