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
  IF NEW.status IS DISTINCT FROM 'shortlisted' THEN
    RETURN NEW;
  END IF;

  IF NEW.candidate_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_candidate_id
  FROM public.candidates
  WHERE lower(email) = lower(NEW.candidate_email)
  LIMIT 1;

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
      'Referral'::application_source,
      NEW.resume_url,
      NEW.notes,
      'shortlisted'::candidate_status,
      'SCREENING'::candidate_lifecycle_status,
      NEW.referred_by,
      'Employee Referral'
    )
    RETURNING id INTO v_candidate_id;
  END IF;

  NEW.candidate_id := v_candidate_id;
  RETURN NEW;
END;
$$;

-- Backfill existing shortlisted referrals that didn't get linked
DO $$
DECLARE
  r record;
  v_candidate_id uuid;
  v_role_title text;
BEGIN
  FOR r IN
    SELECT * FROM public.referrals
    WHERE status = 'shortlisted' AND candidate_id IS NULL
  LOOP
    SELECT id INTO v_candidate_id FROM public.candidates
      WHERE lower(email) = lower(r.candidate_email) LIMIT 1;

    SELECT title INTO v_role_title FROM public.hiring_requirements WHERE id = r.role_id;

    IF v_candidate_id IS NULL THEN
      INSERT INTO public.candidates (
        full_name, email, phone, job_role_applied, source, application_source,
        resume_url, notes, status, lifecycle_status, created_by, created_by_name
      ) VALUES (
        r.candidate_name, r.candidate_email, r.candidate_phone, v_role_title,
        'Employee Referral', 'Referral'::application_source,
        r.resume_url, r.notes,
        'shortlisted'::candidate_status, 'SCREENING'::candidate_lifecycle_status,
        r.referred_by, 'Employee Referral'
      ) RETURNING id INTO v_candidate_id;
    END IF;

    UPDATE public.referrals SET candidate_id = v_candidate_id WHERE id = r.id;
  END LOOP;
END $$;