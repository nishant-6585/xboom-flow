
-- Add split fingerprint columns
ALTER TABLE public.trusted_devices ADD COLUMN IF NOT EXISTS stable_fingerprint text;
ALTER TABLE public.trusted_devices ADD COLUMN IF NOT EXISTS dynamic_fingerprint text;

-- Index for stable fingerprint lookups
CREATE INDEX IF NOT EXISTS idx_trusted_devices_stable_fp
  ON public.trusted_devices (user_id, stable_fingerprint)
  WHERE is_revoked = false;

-- Updated check: stable must match; returns 'trusted', 'step_up', or 'untrusted'
CREATE OR REPLACE FUNCTION public.check_device_trust_v2(
  p_user_id uuid,
  p_device_hash text,
  p_stable_fingerprint text DEFAULT NULL,
  p_dynamic_fingerprint text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT * INTO v_row
  FROM public.trusted_devices
  WHERE user_id = p_user_id
    AND device_hash = p_device_hash
    AND is_revoked = false
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'untrusted';
  END IF;

  -- If stable fingerprint is stored and doesn't match → untrusted (full MFA)
  IF v_row.stable_fingerprint IS NOT NULL
     AND p_stable_fingerprint IS NOT NULL
     AND v_row.stable_fingerprint != p_stable_fingerprint THEN
    RETURN 'untrusted';
  END IF;

  -- If dynamic fingerprint is stored and doesn't match → step_up
  IF v_row.dynamic_fingerprint IS NOT NULL
     AND p_dynamic_fingerprint IS NOT NULL
     AND v_row.dynamic_fingerprint != p_dynamic_fingerprint THEN
    -- Update last_used_at even on step_up
    UPDATE public.trusted_devices SET last_used_at = now() WHERE id = v_row.id;
    RETURN 'step_up';
  END IF;

  -- Full match
  UPDATE public.trusted_devices SET last_used_at = now() WHERE id = v_row.id;
  RETURN 'trusted';
END;
$$;

-- Updated register to store both fingerprints
CREATE OR REPLACE FUNCTION public.register_trusted_device(
  p_user_id uuid,
  p_device_hash text,
  p_device_name text DEFAULT NULL,
  p_days integer DEFAULT 30,
  p_device_fingerprint text DEFAULT NULL,
  p_stable_fingerprint text DEFAULT NULL,
  p_dynamic_fingerprint text DEFAULT NULL
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

  -- Upsert by device_hash
  UPDATE public.trusted_devices
  SET expires_at = now() + (p_days || ' days')::interval,
      is_revoked = false,
      last_used_at = now(),
      device_name = COALESCE(p_device_name, device_name),
      device_fingerprint = COALESCE(p_device_fingerprint, device_fingerprint),
      stable_fingerprint = COALESCE(p_stable_fingerprint, stable_fingerprint),
      dynamic_fingerprint = COALESCE(p_dynamic_fingerprint, dynamic_fingerprint)
  WHERE user_id = p_user_id AND device_hash = p_device_hash
  RETURNING id INTO v_device_id;

  IF v_device_id IS NULL THEN
    INSERT INTO public.trusted_devices (
      user_id, device_hash, device_name, expires_at,
      device_fingerprint, stable_fingerprint, dynamic_fingerprint
    )
    VALUES (
      p_user_id, p_device_hash, p_device_name,
      now() + (p_days || ' days')::interval,
      p_device_fingerprint, p_stable_fingerprint, p_dynamic_fingerprint
    )
    RETURNING id INTO v_device_id;
  END IF;

  RETURN v_device_id;
END;
$$;

-- Keep the old check_device_trust for backward compat but make it use v2
CREATE OR REPLACE FUNCTION public.check_device_trust(
  p_user_id uuid,
  p_device_hash text,
  p_device_fingerprint text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.check_device_trust_v2(p_user_id, p_device_hash, p_device_fingerprint, NULL) != 'untrusted'
$$;
