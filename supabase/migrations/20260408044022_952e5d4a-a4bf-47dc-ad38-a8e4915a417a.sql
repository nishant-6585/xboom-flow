
-- Create trusted_devices table for server-side device trust
CREATE TABLE public.trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash TEXT NOT NULL,
  device_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_revoked BOOLEAN NOT NULL DEFAULT false
);

-- Index for fast lookups
CREATE INDEX idx_trusted_devices_user_id ON public.trusted_devices(user_id);
CREATE INDEX idx_trusted_devices_lookup ON public.trusted_devices(user_id, device_hash) WHERE is_revoked = false;

-- Enable RLS
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

-- Users can read their own trusted devices
CREATE POLICY "Users can view own trusted devices"
  ON public.trusted_devices FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own trusted devices
CREATE POLICY "Users can add own trusted devices"
  ON public.trusted_devices FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update (revoke) their own trusted devices
CREATE POLICY "Users can update own trusted devices"
  ON public.trusted_devices FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Users can delete their own trusted devices
CREATE POLICY "Users can delete own trusted devices"
  ON public.trusted_devices FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Function to check if a device is trusted (bypasses RLS for MFA check flow)
CREATE OR REPLACE FUNCTION public.check_device_trust(p_user_id UUID, p_device_hash TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trusted_devices
    WHERE user_id = p_user_id
      AND device_hash = p_device_hash
      AND is_revoked = false
      AND expires_at > now()
  )
$$;

-- Function to register a trusted device (limits to 5 per user)
CREATE OR REPLACE FUNCTION public.register_trusted_device(
  p_user_id UUID,
  p_device_hash TEXT,
  p_device_name TEXT DEFAULT NULL,
  p_days INTEGER DEFAULT 30
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id UUID;
  v_count INTEGER;
BEGIN
  -- Check existing active device count
  SELECT COUNT(*) INTO v_count
  FROM public.trusted_devices
  WHERE user_id = p_user_id AND is_revoked = false AND expires_at > now();

  -- If at limit, revoke the oldest one
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

  -- Upsert: if same device_hash exists, refresh it
  INSERT INTO public.trusted_devices (user_id, device_hash, device_name, expires_at)
  VALUES (p_user_id, p_device_hash, p_device_name, now() + (p_days || ' days')::interval)
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_device_id;

  -- If no conflict insert, check for existing hash and update
  IF v_device_id IS NULL THEN
    UPDATE public.trusted_devices
    SET expires_at = now() + (p_days || ' days')::interval,
        is_revoked = false,
        last_used_at = now(),
        device_name = COALESCE(p_device_name, device_name)
    WHERE user_id = p_user_id AND device_hash = p_device_hash
    RETURNING id INTO v_device_id;
  END IF;

  -- If still null (no existing record), do a proper insert
  IF v_device_id IS NULL THEN
    INSERT INTO public.trusted_devices (user_id, device_hash, device_name, expires_at)
    VALUES (p_user_id, p_device_hash, p_device_name, now() + (p_days || ' days')::interval)
    RETURNING id INTO v_device_id;
  END IF;

  RETURN v_device_id;
END;
$$;
