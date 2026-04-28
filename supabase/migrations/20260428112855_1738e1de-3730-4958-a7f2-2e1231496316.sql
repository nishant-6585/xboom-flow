-- 1. Reason enum
DO $$ BEGIN
  CREATE TYPE public.resume_access_failure_reason AS ENUM (
    'missing_path',
    'unsupported_format',
    'not_found',
    'forbidden',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Audit table
CREATE TABLE IF NOT EXISTS public.resume_access_failure_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NULL,
  document_path TEXT NULL,
  reason public.resume_access_failure_reason NOT NULL,
  error_message TEXT NULL,
  source TEXT NULL,
  actor_user_id UUID NULL,
  actor_user_id_client_hint UUID NULL,
  actor_role public.app_role NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rafa_referral_id ON public.resume_access_failure_audit (referral_id);
CREATE INDEX IF NOT EXISTS idx_rafa_actor_user_id ON public.resume_access_failure_audit (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_rafa_actor_role ON public.resume_access_failure_audit (actor_role);
CREATE INDEX IF NOT EXISTS idx_rafa_created_at ON public.resume_access_failure_audit (created_at DESC);

ALTER TABLE public.resume_access_failure_audit ENABLE ROW LEVEL SECURITY;

-- Only HR/Admin can read directly
DROP POLICY IF EXISTS "HR/Admin can read resume access failure audit" ON public.resume_access_failure_audit;
CREATE POLICY "HR/Admin can read resume access failure audit"
ON public.resume_access_failure_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

-- No direct INSERT/UPDATE/DELETE policies — writes only go through the SECURITY DEFINER RPC below.

-- 3. Insert RPC (any authenticated user can record their own failures)
CREATE OR REPLACE FUNCTION public.log_resume_access_failure(
  _referral_id UUID,
  _document_path TEXT,
  _reason public.resume_access_failure_reason,
  _error_message TEXT,
  _source TEXT,
  _actor_user_id UUID,
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
    actor_user_id, actor_user_id_client_hint, actor_role, user_agent
  ) VALUES (
    _referral_id, _document_path, _reason, _error_message, _source,
    auth.uid(), _actor_user_id, v_role, _user_agent
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_resume_access_failure(UUID, TEXT, public.resume_access_failure_reason, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_resume_access_failure(UUID, TEXT, public.resume_access_failure_reason, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- 4. List RPC (HR/Admin only) — filters by referral_id, role, time range
CREATE OR REPLACE FUNCTION public.list_resume_access_failures(
  _referral_id UUID DEFAULT NULL,
  _actor_role public.app_role DEFAULT NULL,
  _from TIMESTAMPTZ DEFAULT NULL,
  _to TIMESTAMPTZ DEFAULT NULL,
  _limit INT DEFAULT 200
) RETURNS TABLE (
  id UUID,
  referral_id UUID,
  document_path TEXT,
  reason public.resume_access_failure_reason,
  error_message TEXT,
  source TEXT,
  actor_user_id UUID,
  actor_role public.app_role,
  user_agent TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    a.id, a.referral_id, a.document_path, a.reason, a.error_message,
    a.source, a.actor_user_id, a.actor_role, a.user_agent, a.created_at
  FROM public.resume_access_failure_audit a
  WHERE (_referral_id IS NULL OR a.referral_id = _referral_id)
    AND (_actor_role IS NULL OR a.actor_role = _actor_role)
    AND (_from IS NULL OR a.created_at >= _from)
    AND (_to IS NULL OR a.created_at <= _to)
  ORDER BY a.created_at DESC
  LIMIT LEAST(COALESCE(_limit, 200), 1000);
END;
$$;

REVOKE ALL ON FUNCTION public.list_resume_access_failures(UUID, public.app_role, TIMESTAMPTZ, TIMESTAMPTZ, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_resume_access_failures(UUID, public.app_role, TIMESTAMPTZ, TIMESTAMPTZ, INT) TO authenticated;