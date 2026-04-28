ALTER TABLE public.resume_access_failure_audit
  ADD COLUMN IF NOT EXISTS retry_of_failure_id UUID NULL REFERENCES public.resume_access_failure_audit(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_retry BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_rafa_is_retry ON public.resume_access_failure_audit (is_retry) WHERE is_retry = TRUE;
CREATE INDEX IF NOT EXISTS idx_rafa_retry_of ON public.resume_access_failure_audit (retry_of_failure_id);

CREATE OR REPLACE FUNCTION public.log_resume_access_retry(
  _retry_of_failure_id UUID,
  _referral_id UUID,
  _document_path TEXT,
  _source TEXT,
  _user_agent TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_role public.app_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  ORDER BY CASE role
    WHEN 'admin' THEN 1
    WHEN 'hr' THEN 2
    ELSE 99
  END
  LIMIT 1;

  INSERT INTO public.resume_access_failure_audit (
    referral_id, document_path, reason, error_message, source,
    actor_user_id, actor_role, user_agent,
    retry_of_failure_id, is_retry
  ) VALUES (
    _referral_id, _document_path, 'unknown', 'retry attempt by user', _source,
    auth.uid(), v_role, _user_agent,
    _retry_of_failure_id, TRUE
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_resume_access_retry(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_resume_access_retry(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;