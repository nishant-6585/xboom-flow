ALTER TABLE public.candidates DISABLE TRIGGER candidate_audit_trigger;
ALTER TABLE public.candidates DISABLE TRIGGER trg_audit_candidate_lifecycle;
ALTER TABLE public.candidates DISABLE TRIGGER trg_validate_candidate_lifecycle;
ALTER TABLE public.candidates DISABLE TRIGGER validate_candidate_trigger;

UPDATE public.candidates SET status = 'offered' WHERE id = 'c852c164-b86c-4547-86fe-8102df0fcb7f';

ALTER TABLE public.candidates ENABLE TRIGGER candidate_audit_trigger;
ALTER TABLE public.candidates ENABLE TRIGGER trg_audit_candidate_lifecycle;
ALTER TABLE public.candidates ENABLE TRIGGER trg_validate_candidate_lifecycle;
ALTER TABLE public.candidates ENABLE TRIGGER validate_candidate_trigger;