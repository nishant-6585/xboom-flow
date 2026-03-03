
-- =============================================
-- Candidate Database ATS Upgrade - Schema Only
-- =============================================

-- 1. New enums (these were already created in failed migration, so use IF NOT EXISTS workaround)
DO $$ BEGIN CREATE TYPE public.application_source AS ENUM ('Referral', 'Naukri', 'LinkedIn', 'Website', 'Consultant', 'Walk-in', 'Other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.employment_type AS ENUM ('Full-time', 'Contract', 'Intern'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.screening_status AS ENUM ('New', 'Shortlisted', 'Rejected', 'On Hold'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.interview_stage AS ENUM ('HR', 'Technical', 'Managerial', 'Final'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.final_status AS ENUM ('Selected', 'Rejected', 'Pending'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add new enum values to candidate_status
ALTER TYPE public.candidate_status ADD VALUE IF NOT EXISTS 'active';
ALTER TYPE public.candidate_status ADD VALUE IF NOT EXISTS 'offered';
ALTER TYPE public.candidate_status ADD VALUE IF NOT EXISTS 'joined';
ALTER TYPE public.candidate_status ADD VALUE IF NOT EXISTS 'dropped';

-- 3. Add new columns to candidates table
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS candidate_number TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS location_city TEXT,
  ADD COLUMN IF NOT EXISTS location_state TEXT,
  ADD COLUMN IF NOT EXISTS resume_url TEXT,
  ADD COLUMN IF NOT EXISTS application_source public.application_source DEFAULT 'Other',
  ADD COLUMN IF NOT EXISTS relevant_experience_years NUMERIC,
  ADD COLUMN IF NOT EXISTS current_designation TEXT,
  ADD COLUMN IF NOT EXISTS employment_type public.employment_type DEFAULT 'Full-time',
  ADD COLUMN IF NOT EXISTS job_role_applied TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS recruiter_id UUID,
  ADD COLUMN IF NOT EXISTS recruiter_name TEXT,
  ADD COLUMN IF NOT EXISTS screening_status public.screening_status DEFAULT 'New',
  ADD COLUMN IF NOT EXISTS interview_stage public.interview_stage,
  ADD COLUMN IF NOT EXISTS final_status public.final_status DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS offer_letter_issued BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS joining_date DATE,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_date DATE,
  ADD COLUMN IF NOT EXISTS remarks TEXT;

-- 4. Generate candidate_number trigger
CREATE OR REPLACE FUNCTION public.generate_candidate_number()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  next_num INTEGER;
  year_prefix TEXT;
  new_candidate_number TEXT;
BEGIN
  IF NEW.candidate_number IS NULL THEN
    year_prefix := TO_CHAR(NOW(), 'YYYY');
    LOCK TABLE public.candidates IN SHARE ROW EXCLUSIVE MODE;
    SELECT COALESCE(MAX(
      CASE WHEN candidate_number ~ ('^CAND-' || year_prefix || '-[0-9]+$') 
        THEN CAST(SUBSTRING(candidate_number FROM 11) AS INTEGER) ELSE 0 END
    ), 0) + 1 INTO next_num
    FROM public.candidates WHERE candidate_number LIKE 'CAND-' || year_prefix || '-%';
    new_candidate_number := 'CAND-' || year_prefix || '-' || LPAD(next_num::TEXT, 4, '0');
    WHILE EXISTS (SELECT 1 FROM public.candidates WHERE candidate_number = new_candidate_number) LOOP
      next_num := next_num + 1;
      new_candidate_number := 'CAND-' || year_prefix || '-' || LPAD(next_num::TEXT, 4, '0');
    END LOOP;
    NEW.candidate_number := new_candidate_number;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generate_candidate_number_trigger ON public.candidates;
CREATE TRIGGER generate_candidate_number_trigger
  BEFORE INSERT ON public.candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_candidate_number();

-- 5. Add new columns to interview_records
ALTER TABLE public.interview_records
  ADD COLUMN IF NOT EXISTS interviewer_id UUID,
  ADD COLUMN IF NOT EXISTS result TEXT;

-- 6. Candidate audit trigger
CREATE OR REPLACE FUNCTION public.log_candidate_audit()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.final_status IS DISTINCT FROM NEW.final_status THEN
    INSERT INTO public.edit_history (table_name, record_id, field_name, old_value, new_value, edited_by, edited_by_name)
    VALUES ('candidates', NEW.id, 'final_status', OLD.final_status::text, NEW.final_status::text, 
            COALESCE(auth.uid()::text, 'system'), COALESCE((SELECT name FROM public.profiles WHERE user_id = auth.uid()), 'System'));
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.edit_history (table_name, record_id, field_name, old_value, new_value, edited_by, edited_by_name)
    VALUES ('candidates', NEW.id, 'status', OLD.status::text, NEW.status::text,
            COALESCE(auth.uid()::text, 'system'), COALESCE((SELECT name FROM public.profiles WHERE user_id = auth.uid()), 'System'));
  END IF;
  IF OLD.offer_letter_issued IS DISTINCT FROM NEW.offer_letter_issued THEN
    INSERT INTO public.edit_history (table_name, record_id, field_name, old_value, new_value, edited_by, edited_by_name)
    VALUES ('candidates', NEW.id, 'offer_letter_issued', OLD.offer_letter_issued::text, NEW.offer_letter_issued::text,
            COALESCE(auth.uid()::text, 'system'), COALESCE((SELECT name FROM public.profiles WHERE user_id = auth.uid()), 'System'));
  END IF;
  IF OLD.joining_date IS DISTINCT FROM NEW.joining_date THEN
    INSERT INTO public.edit_history (table_name, record_id, field_name, old_value, new_value, edited_by, edited_by_name)
    VALUES ('candidates', NEW.id, 'joining_date', OLD.joining_date::text, NEW.joining_date::text,
            COALESCE(auth.uid()::text, 'system'), COALESCE((SELECT name FROM public.profiles WHERE user_id = auth.uid()), 'System'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS candidate_audit_trigger ON public.candidates;
CREATE TRIGGER candidate_audit_trigger
  AFTER UPDATE ON public.candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.log_candidate_audit();

-- 7. Validation trigger
CREATE OR REPLACE FUNCTION public.validate_candidate_data()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.offer_letter_issued = true AND NEW.final_status != 'Selected' THEN
    RAISE EXCEPTION 'Offer letter can only be issued when final status is Selected';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_candidate_trigger ON public.candidates;
CREATE TRIGGER validate_candidate_trigger
  BEFORE INSERT OR UPDATE ON public.candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_candidate_data();
