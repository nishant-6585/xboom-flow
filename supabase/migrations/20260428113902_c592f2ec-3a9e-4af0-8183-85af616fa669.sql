-- Add classification signal columns to resume access failure audit
ALTER TABLE public.resume_access_failure_audit
  ADD COLUMN IF NOT EXISTS http_status integer,
  ADD COLUMN IF NOT EXISTS error_slug text,
  ADD COLUMN IF NOT EXISTS keyword_matched boolean;

CREATE INDEX IF NOT EXISTS idx_rafa_http_status ON public.resume_access_failure_audit(http_status) WHERE http_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rafa_error_slug ON public.resume_access_failure_audit(error_slug) WHERE error_slug IS NOT NULL;

-- Replace RPC to accept the new signals
CREATE OR REPLACE FUNCTION public.log_resume_access_failure(
  _referral_id uuid,
  _document_path text,
  _reason resume_access_failure_reason,
  _error_message text,
  _source text,
  _actor_user_id uuid,
  _user_agent text,
  _http_status integer DEFAULT NULL,
  _error_slug text DEFAULT NULL,
  _keyword_matched boolean DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_actor uuid := auth.uid();
  v_role app_role;
BEGIN
  -- Best-effort role lookup (first role for the actor)
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = v_actor
  LIMIT 1;

  INSERT INTO public.resume_access_failure_audit (
    referral_id, document_path, reason, error_message, source,
    actor_user_id, actor_user_id_client_hint, actor_role, user_agent,
    http_status, error_slug, keyword_matched
  )
  VALUES (
    _referral_id, _document_path, _reason, _error_message, _source,
    v_actor, _actor_user_id, v_role, _user_agent,
    _http_status, NULLIF(lower(trim(_error_slug)), ''), _keyword_matched
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_resume_access_failure(uuid, text, resume_access_failure_reason, text, text, uuid, text, integer, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_resume_access_failure(uuid, text, resume_access_failure_reason, text, text, uuid, text, integer, text, boolean) TO authenticated;