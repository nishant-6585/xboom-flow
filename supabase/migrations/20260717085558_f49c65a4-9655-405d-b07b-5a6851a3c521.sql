-- Server-side validation for enquiries.response_notes.
-- Mirrors the client rules in src/lib/enquiryQuoteMirror.ts so a bypassed
-- client (curl / direct API / another integration) cannot save invalid
-- notes. Fires BEFORE INSERT OR UPDATE on public.enquiries.
--
-- Rules:
--   * response_notes is optional (NULL is fine).
--   * If provided, the value MUST NOT be whitespace-only — we reject
--     rather than silently normalizing so callers see the mistake.
--   * If provided, the trimmed length must be between 5 and 2000 chars.
--   * The trigger stores the trimmed value so no whitespace leaks into
--     the discussion mirror.

CREATE OR REPLACE FUNCTION public.validate_enquiry_response_notes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  trimmed_notes text;
BEGIN
  IF NEW.response_notes IS NULL THEN
    RETURN NEW;
  END IF;

  trimmed_notes := btrim(NEW.response_notes);

  IF length(trimmed_notes) = 0 THEN
    RAISE EXCEPTION 'response_notes cannot be whitespace-only — leave the field NULL if there is nothing to add'
      USING ERRCODE = '22023', HINT = 'Pass NULL instead of an empty / whitespace-only string.';
  END IF;

  IF length(trimmed_notes) < 5 THEN
    RAISE EXCEPTION 'response_notes must be at least 5 characters (got %)', length(trimmed_notes)
      USING ERRCODE = '22023';
  END IF;

  IF length(trimmed_notes) > 2000 THEN
    RAISE EXCEPTION 'response_notes must be 2000 characters or fewer (got %)', length(trimmed_notes)
      USING ERRCODE = '22023';
  END IF;

  -- Persist the trimmed value so downstream consumers (mirror, PDF, etc.)
  -- never see leading/trailing whitespace.
  NEW.response_notes := trimmed_notes;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_enquiry_response_notes ON public.enquiries;
CREATE TRIGGER trg_validate_enquiry_response_notes
BEFORE INSERT OR UPDATE OF response_notes ON public.enquiries
FOR EACH ROW
EXECUTE FUNCTION public.validate_enquiry_response_notes();

COMMENT ON FUNCTION public.validate_enquiry_response_notes IS
  'Server-side guard for enquiries.response_notes: rejects whitespace-only values and enforces 5..2000 char length (mirrors client rules in src/lib/enquiryQuoteMirror.ts).';