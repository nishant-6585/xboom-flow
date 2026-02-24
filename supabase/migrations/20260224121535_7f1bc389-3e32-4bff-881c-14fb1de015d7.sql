
-- ============================================================
-- Login Rate Limiting Functions
-- ============================================================
-- Policy: 5 failed attempts within 15 minutes = locked for 15 minutes
-- Uses the existing login_history table (no schema changes needed)

-- 1. Check if a login attempt is allowed (called BEFORE auth)
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(p_email text)
RETURNS TABLE(allowed boolean, retry_after_seconds integer, recent_failures integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_max_attempts CONSTANT integer := 5;
  v_window_minutes CONSTANT integer := 15;
  v_lockout_minutes CONSTANT integer := 15;
  v_failure_count integer;
  v_latest_failure timestamptz;
  v_lockout_remaining integer;
BEGIN
  -- Count failed attempts in the window
  SELECT COUNT(*), MAX(attempted_at)
  INTO v_failure_count, v_latest_failure
  FROM public.login_history
  WHERE email = LOWER(TRIM(p_email))
    AND status = 'failure'
    AND attempted_at > now() - (v_window_minutes || ' minutes')::interval;

  -- If under threshold, allow
  IF v_failure_count < v_max_attempts THEN
    RETURN QUERY SELECT true, 0, v_failure_count;
    RETURN;
  END IF;

  -- Calculate lockout remaining from the latest failure
  v_lockout_remaining := EXTRACT(EPOCH FROM (
    v_latest_failure + (v_lockout_minutes || ' minutes')::interval - now()
  ))::integer;

  IF v_lockout_remaining > 0 THEN
    RETURN QUERY SELECT false, v_lockout_remaining, v_failure_count;
  ELSE
    -- Lockout expired, allow
    RETURN QUERY SELECT true, 0, v_failure_count;
  END IF;
END;
$$;

-- 2. Record a login attempt (called AFTER auth attempt)
CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_email text,
  p_status text,
  p_failure_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.login_history (
    email,
    status,
    failure_reason,
    user_id,
    attempted_at
  ) VALUES (
    LOWER(TRIM(p_email)),
    p_status,
    p_failure_reason,
    p_user_id,
    now()
  );
END;
$$;

-- 3. Index for fast rate-limit lookups
CREATE INDEX IF NOT EXISTS idx_login_history_rate_limit
  ON public.login_history (email, status, attempted_at DESC);
