-- Add link column
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_referrals_candidate_id ON public.referrals(candidate_id);

-- Trigger function: when status flips to 'shortlisted', create/link a candidate
CREATE OR REPLACE FUNCTION public.referral_to_candidate_on_shortlist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_id uuid;
  v_role_title text;
BEGIN
  -- Only act when status becomes 'shortlisted'
  IF NEW.status IS DISTINCT FROM 'shortlisted' THEN
    RETURN NEW;
  END IF;

  -- If already linked, do nothing
  IF NEW.candidate_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Reuse existing candidate by email if present
  SELECT id INTO v_candidate_id
  FROM public.candidates
  WHERE lower(email) = lower(NEW.candidate_email)
  LIMIT 1;

  -- Look up the hiring role title
  SELECT title INTO v_role_title
  FROM public.hiring_requirements
  WHERE id = NEW.role_id;

  IF v_candidate_id IS NULL THEN
    INSERT INTO public.candidates (
      full_name,
      email,
      phone,
      job_role_applied,
      source,
      application_source,
      resume_url,
      notes,
      status,
      lifecycle_status,
      created_by,
      created_by_name
    ) VALUES (
      NEW.candidate_name,
      NEW.candidate_email,
      NEW.candidate_phone,
      v_role_title,
      'Employee Referral',
      'referral'::application_source,
      NEW.resume_url,
      NEW.notes,
      'shortlisted'::candidate_status,
      'screening'::candidate_lifecycle_status,
      NEW.referred_by,
      'Employee Referral'
    )
    RETURNING id INTO v_candidate_id;
  END IF;

  NEW.candidate_id := v_candidate_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't block the referral update if candidate creation fails
  RAISE WARNING 'referral_to_candidate_on_shortlist failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_to_candidate_on_shortlist ON public.referrals;
CREATE TRIGGER trg_referral_to_candidate_on_shortlist
BEFORE UPDATE OF status ON public.referrals
FOR EACH ROW
EXECUTE FUNCTION public.referral_to_candidate_on_shortlist();