
-- Create candidate status enum
CREATE TYPE public.candidate_status AS ENUM ('applied', 'shortlisted', 'rejected', 'hired', 'blacklisted');

-- Create interview decision enum
CREATE TYPE public.interview_decision AS ENUM ('pass', 'reject', 'hold');

-- Create candidates table
CREATE TABLE public.candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  years_of_experience NUMERIC,
  current_company TEXT,
  current_ctc NUMERIC,
  expected_ctc NUMERIC,
  notice_period_days INTEGER,
  location TEXT,
  primary_skills TEXT[],
  source TEXT,
  status public.candidate_status NOT NULL DEFAULT 'applied',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT candidates_email_unique UNIQUE (email)
);

-- Indexes for candidates
CREATE INDEX idx_candidates_status ON public.candidates (status);
CREATE INDEX idx_candidates_location ON public.candidates (location);
CREATE INDEX idx_candidates_email ON public.candidates (email);
CREATE INDEX idx_candidates_created_at ON public.candidates (created_at DESC);
CREATE INDEX idx_candidates_skills ON public.candidates USING GIN (primary_skills);

-- Create candidate_documents table
CREATE TABLE public.candidate_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidate_documents_candidate_id ON public.candidate_documents (candidate_id);

-- Create interview_records table
CREATE TABLE public.interview_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  round_type TEXT NOT NULL,
  interviewer_name TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  decision public.interview_decision NOT NULL DEFAULT 'hold',
  interview_date DATE NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_interview_records_candidate_id ON public.interview_records (candidate_id);

-- Enable RLS on all tables
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Admin and HR only
CREATE POLICY "Admin and HR can read candidates"
  ON public.candidates FOR SELECT
  USING (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Admin and HR can insert candidates"
  ON public.candidates FOR INSERT
  WITH CHECK (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Admin and HR can update candidates"
  ON public.candidates FOR UPDATE
  USING (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Admin and HR can delete candidates"
  ON public.candidates FOR DELETE
  USING (public.is_hr_or_admin(auth.uid()));

-- Candidate documents policies
CREATE POLICY "Admin and HR can read candidate documents"
  ON public.candidate_documents FOR SELECT
  USING (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Admin and HR can insert candidate documents"
  ON public.candidate_documents FOR INSERT
  WITH CHECK (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Admin and HR can delete candidate documents"
  ON public.candidate_documents FOR DELETE
  USING (public.is_hr_or_admin(auth.uid()));

-- Interview records policies
CREATE POLICY "Admin and HR can read interview records"
  ON public.interview_records FOR SELECT
  USING (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Admin and HR can insert interview records"
  ON public.interview_records FOR INSERT
  WITH CHECK (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Admin and HR can update interview records"
  ON public.interview_records FOR UPDATE
  USING (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Admin and HR can delete interview records"
  ON public.interview_records FOR DELETE
  USING (public.is_hr_or_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_candidates_updated_at
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for candidate CVs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'candidate-cvs',
  'candidate-cvs',
  false,
  5242880,
  ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

-- Storage RLS policies
CREATE POLICY "Admin and HR can upload candidate CVs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'candidate-cvs'
    AND public.is_hr_or_admin(auth.uid())
  );

CREATE POLICY "Admin and HR can view candidate CVs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'candidate-cvs'
    AND public.is_hr_or_admin(auth.uid())
  );

CREATE POLICY "Admin and HR can delete candidate CVs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'candidate-cvs'
    AND public.is_hr_or_admin(auth.uid())
  );
