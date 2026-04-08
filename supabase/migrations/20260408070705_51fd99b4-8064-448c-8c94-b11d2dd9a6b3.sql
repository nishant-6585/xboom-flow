-- Add user_agent column to user_sessions for anomaly detection
ALTER TABLE public.user_sessions 
ADD COLUMN IF NOT EXISTS user_agent text;

-- Function to clear MFA freshness (used by anomaly detection)
CREATE OR REPLACE FUNCTION public.update_mfa_verified_at_to_null(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.user_sessions
  SET last_mfa_verified_at = NULL
  WHERE user_id = p_user_id AND is_current = true;
END;
$$;