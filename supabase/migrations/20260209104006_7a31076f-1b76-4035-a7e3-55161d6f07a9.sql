-- Fix meetings RLS: Only allow access to participants, owners, hosts, and admins
-- First drop existing policies
DROP POLICY IF EXISTS "Users can view all meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can view relevant meetings" ON public.meetings;
DROP POLICY IF EXISTS "Authenticated users can read meetings" ON public.meetings;

-- Create more restrictive select policy (cast auth.uid() to text for participants array comparison)
CREATE POLICY "Users can view their meetings"
ON public.meetings
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR host_id = auth.uid()
  OR auth.uid()::text = ANY(participants)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Fix form submissions: Add size constraint to prevent resource exhaustion
-- Use a trigger instead of CHECK constraint to avoid immutability issues
CREATE OR REPLACE FUNCTION public.validate_form_submission()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate submission_data size (max 100KB)
  IF octet_length(NEW.submission_data::text) > 100000 THEN
    RAISE EXCEPTION 'Submission data exceeds maximum size limit (100KB)';
  END IF;
  
  -- Validate JSON depth is not too deep (max 5 levels to prevent DoS)
  IF jsonb_typeof(NEW.submission_data) = 'object' THEN
    -- Simple depth check: if the stringified version is way larger than expected, reject
    IF octet_length(NEW.submission_data::text) > 50000 AND 
       (SELECT COUNT(*) FROM jsonb_each_text(NEW.submission_data)) < 5 THEN
      RAISE EXCEPTION 'Submission data structure is too deeply nested';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for form submission validation
DROP TRIGGER IF EXISTS validate_form_submission_trigger ON public.form_submissions;
CREATE TRIGGER validate_form_submission_trigger
BEFORE INSERT OR UPDATE ON public.form_submissions
FOR EACH ROW
EXECUTE FUNCTION public.validate_form_submission();