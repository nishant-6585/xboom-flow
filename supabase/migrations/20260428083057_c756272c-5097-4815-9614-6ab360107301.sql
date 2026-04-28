
-- =========================================
-- HIRING REQUIREMENTS
-- =========================================
CREATE TABLE public.hiring_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  department TEXT,
  description TEXT,
  open_positions INT NOT NULL DEFAULT 1 CHECK (open_positions >= 0),
  location TEXT,
  experience_required TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hiring_requirements_status ON public.hiring_requirements(status);
CREATE INDEX idx_hiring_requirements_created_at ON public.hiring_requirements(created_at DESC);

ALTER TABLE public.hiring_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users view hiring requirements"
  ON public.hiring_requirements FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "HR/Admin insert hiring requirements"
  ON public.hiring_requirements FOR INSERT
  TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr')
  );

CREATE POLICY "HR/Admin update hiring requirements"
  ON public.hiring_requirements FOR UPDATE
  TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr')
  );

CREATE POLICY "HR/Admin delete hiring requirements"
  ON public.hiring_requirements FOR DELETE
  TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr')
  );

CREATE TRIGGER trg_hiring_requirements_updated_at
  BEFORE UPDATE ON public.hiring_requirements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- REFERRALS
-- =========================================
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  candidate_phone TEXT NOT NULL,
  resume_url TEXT,
  role_id UUID NOT NULL REFERENCES public.hiring_requirements(id) ON DELETE CASCADE,
  referred_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','screening','shortlisted','rejected','hired')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_referrals_role_id ON public.referrals(role_id);
CREATE INDEX idx_referrals_referred_by ON public.referrals(referred_by);
CREATE INDEX idx_referrals_status ON public.referrals(status);
CREATE INDEX idx_referrals_created_at ON public.referrals(created_at DESC);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- SELECT: HR/Admin see all; employees see their own
CREATE POLICY "View referrals (own or HR/Admin)"
  ON public.referrals FOR SELECT
  TO authenticated USING (
    referred_by = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'hr')
  );

-- INSERT: any authenticated user, must set referred_by = self
CREATE POLICY "Authenticated users create referrals"
  ON public.referrals FOR INSERT
  TO authenticated WITH CHECK (referred_by = auth.uid());

-- UPDATE: HR/Admin only
CREATE POLICY "HR/Admin update referrals"
  ON public.referrals FOR UPDATE
  TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr')
  );

-- DELETE: HR/Admin only
CREATE POLICY "HR/Admin delete referrals"
  ON public.referrals FOR DELETE
  TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr')
  );

CREATE TRIGGER trg_referrals_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Duplicate prevention: same candidate_email + role_id within 24h
CREATE OR REPLACE FUNCTION public.prevent_duplicate_referral()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.referrals
    WHERE role_id = NEW.role_id
      AND lower(candidate_email) = lower(NEW.candidate_email)
      AND created_at > now() - interval '24 hours'
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'Duplicate referral: this candidate was already referred for this role within the last 24 hours';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_referrals_prevent_duplicate
  BEFORE INSERT ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_referral();

-- =========================================
-- STORAGE BUCKET
-- =========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('referral-resumes','referral-resumes', false)
ON CONFLICT (id) DO NOTHING;

-- Anyone authenticated can upload
CREATE POLICY "Authenticated upload referral resumes"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'referral-resumes');

-- HR/Admin can read all; uploader can read their own (folder = uid)
CREATE POLICY "Read referral resumes (HR/Admin or owner)"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'referral-resumes'
    AND (
      public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'hr')
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

-- HR/Admin can delete
CREATE POLICY "HR/Admin delete referral resumes"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'referral-resumes'
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  );
