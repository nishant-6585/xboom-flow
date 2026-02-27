-- Add revocation_reason column to user_sessions
ALTER TABLE public.user_sessions 
ADD COLUMN IF NOT EXISTS revocation_reason TEXT;

-- Add index for efficient session validation lookups
CREATE INDEX IF NOT EXISTS idx_user_sessions_active_user 
ON public.user_sessions (user_id, is_active, is_current) 
WHERE is_active = true AND is_current = true;

-- Comment for documentation
COMMENT ON COLUMN public.user_sessions.revocation_reason IS 'Reason for session revocation: IDLE_TIMEOUT, ABSOLUTE_TIMEOUT, USER_REVOKED, SIGNED_OUT, PASSWORD_CHANGED';