
-- 1. Rate limit buckets table (DB-backed, replaces in-memory)
CREATE TABLE public.rate_limit_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_duration_ms INTEGER NOT NULL DEFAULT 60000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_rate_limit_bucket_key ON public.rate_limit_buckets (bucket_key);

-- Cleanup function for expired buckets
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_buckets()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.rate_limit_buckets
  WHERE window_start + (window_duration_ms || ' milliseconds')::interval < now();
END;
$$;

-- Rate limit check function
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_max_requests INTEGER DEFAULT 30,
  p_window_ms INTEGER DEFAULT 60000
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT * INTO v_row FROM public.rate_limit_buckets WHERE bucket_key = p_key;
  
  IF NOT FOUND THEN
    INSERT INTO public.rate_limit_buckets (bucket_key, request_count, window_start, window_duration_ms)
    VALUES (p_key, 1, now(), p_window_ms)
    ON CONFLICT (bucket_key) DO UPDATE SET request_count = rate_limit_buckets.request_count + 1;
    RETURN true;
  END IF;
  
  -- Window expired, reset
  IF v_row.window_start + (v_row.window_duration_ms || ' milliseconds')::interval < now() THEN
    UPDATE public.rate_limit_buckets
    SET request_count = 1, window_start = now()
    WHERE bucket_key = p_key;
    RETURN true;
  END IF;
  
  -- Within window, increment
  UPDATE public.rate_limit_buckets
  SET request_count = request_count + 1
  WHERE bucket_key = p_key;
  
  RETURN (v_row.request_count + 1) <= p_max_requests;
END;
$$;

-- 2. Add session_version and last_ip to user_sessions
ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_ip TEXT;

-- 3. Security alerts table
CREATE TABLE public.security_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  details JSONB DEFAULT '{}'::jsonb,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_security_alerts_user ON public.security_alerts (user_id, created_at DESC);
CREATE INDEX idx_security_alerts_unresolved ON public.security_alerts (is_resolved, severity) WHERE is_resolved = false;

-- Enable RLS
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

-- RLS: rate_limit_buckets only accessible via service role / security definer functions
-- No direct access policies needed (functions use SECURITY DEFINER)

-- RLS: security_alerts readable by admins
CREATE POLICY "Admins can view security alerts"
ON public.security_alerts FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4. Increment session version function (for logout-all / security events)
CREATE OR REPLACE FUNCTION public.increment_session_version(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.user_sessions
  SET session_version = session_version + 1
  WHERE user_id = p_user_id AND is_current = true;
END;
$$;

-- 5. Create security alert function
CREATE OR REPLACE FUNCTION public.create_security_alert(
  p_user_id UUID,
  p_alert_type TEXT,
  p_severity TEXT DEFAULT 'medium',
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_alert_id UUID;
BEGIN
  INSERT INTO public.security_alerts (user_id, alert_type, severity, details)
  VALUES (p_user_id, p_alert_type, p_severity, p_details)
  RETURNING id INTO v_alert_id;
  
  -- Also log to audit log for unified tracking
  INSERT INTO public.security_audit_log (user_id, user_name, action, details)
  VALUES (
    p_user_id,
    COALESCE((SELECT name FROM public.profiles WHERE user_id = p_user_id), 'unknown'),
    'SECURITY_ALERT_' || UPPER(p_alert_type),
    p_details
  );
  
  RETURN v_alert_id;
END;
$$;
