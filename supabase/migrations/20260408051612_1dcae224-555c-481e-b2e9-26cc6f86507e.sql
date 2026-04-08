
-- Phase 1: Add device_fingerprint column to trusted_devices
ALTER TABLE public.trusted_devices ADD COLUMN IF NOT EXISTS device_fingerprint text;

-- Phase 2: Add last_mfa_verified_at to user_sessions for step-up auth
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS last_mfa_verified_at timestamptz;

-- Phase 6: Create index for faster device lookups
CREATE INDEX IF NOT EXISTS idx_trusted_devices_fingerprint ON public.trusted_devices (user_id, device_fingerprint) WHERE is_revoked = false;

-- Phase 6: Auto-cleanup expired devices function
CREATE OR REPLACE FUNCTION public.cleanup_expired_devices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.trusted_devices
  WHERE expires_at < now() - interval '7 days';
END;
$$;

-- Update check_device_trust to also verify fingerprint
CREATE OR REPLACE FUNCTION public.check_device_trust(p_user_id uuid, p_device_hash text, p_device_fingerprint text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trusted_devices
    WHERE user_id = p_user_id
      AND device_hash = p_device_hash
      AND is_revoked = false
      AND expires_at > now()
      AND (p_device_fingerprint IS NULL OR device_fingerprint IS NULL OR device_fingerprint = p_device_fingerprint)
  )
$$;

-- Update register_trusted_device to store fingerprint
CREATE OR REPLACE FUNCTION public.register_trusted_device(
  p_user_id uuid,
  p_device_hash text,
  p_device_name text DEFAULT NULL,
  p_days integer DEFAULT 30,
  p_device_fingerprint text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_device_id UUID;
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.trusted_devices
  WHERE user_id = p_user_id AND is_revoked = false AND expires_at > now();

  IF v_count >= 5 THEN
    UPDATE public.trusted_devices
    SET is_revoked = true
    WHERE id = (
      SELECT id FROM public.trusted_devices
      WHERE user_id = p_user_id AND is_revoked = false
      ORDER BY last_used_at ASC
      LIMIT 1
    );
  END IF;

  -- Check if same device_hash already exists for this user
  UPDATE public.trusted_devices
  SET expires_at = now() + (p_days || ' days')::interval,
      is_revoked = false,
      last_used_at = now(),
      device_name = COALESCE(p_device_name, device_name),
      device_fingerprint = COALESCE(p_device_fingerprint, device_fingerprint)
  WHERE user_id = p_user_id AND device_hash = p_device_hash
  RETURNING id INTO v_device_id;

  IF v_device_id IS NULL THEN
    INSERT INTO public.trusted_devices (user_id, device_hash, device_name, expires_at, device_fingerprint)
    VALUES (p_user_id, p_device_hash, p_device_name, now() + (p_days || ' days')::interval, p_device_fingerprint)
    RETURNING id INTO v_device_id;
  END IF;

  RETURN v_device_id;
END;
$$;

-- Function to update last_mfa_verified_at on user_sessions
CREATE OR REPLACE FUNCTION public.update_mfa_verified_at(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.user_sessions
  SET last_mfa_verified_at = now()
  WHERE user_id = p_user_id AND is_current = true;
END;
$$;

-- Function to check if step-up auth is needed (last MFA > 24h ago)
CREATE OR REPLACE FUNCTION public.needs_step_up_auth(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.user_sessions
    WHERE user_id = p_user_id
      AND is_current = true
      AND last_mfa_verified_at IS NOT NULL
      AND last_mfa_verified_at > now() - interval '24 hours'
  )
$$;
