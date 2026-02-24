
-- ============================================================
-- 1. USER SETTINGS (preferences, notification toggles, theme)
-- ============================================================
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  -- Theme & UI
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
  compact_mode BOOLEAN NOT NULL DEFAULT false,
  language TEXT NOT NULL DEFAULT 'en',
  -- Notification preferences (stored as JSONB for flexibility)
  email_notifications JSONB NOT NULL DEFAULT '{"orders": true, "enquiries": true, "tasks": true, "attendance": true, "system": true}'::jsonb,
  in_app_notifications BOOLEAN NOT NULL DEFAULT true,
  critical_alerts BOOLEAN NOT NULL DEFAULT true, -- forced on, UI shows but cannot disable
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own settings
CREATE POLICY "Users can view own settings"
  ON public.user_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND is_user_approved(auth.uid()));

CREATE POLICY "Users can insert own settings"
  ON public.user_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND is_user_approved(auth.uid()));

CREATE POLICY "Users can update own settings"
  ON public.user_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND is_user_approved(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. USER SESSIONS (active session tracking)
-- ============================================================
CREATE TABLE public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_token_hash TEXT, -- hash of JWT, never store raw token
  device_info TEXT,
  browser TEXT,
  os TEXT,
  ip_address TEXT,
  location TEXT, -- approximate, from IP
  is_current BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_active ON public.user_sessions(user_id, is_active) WHERE is_active = true;

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can view own sessions
CREATE POLICY "Users can view own sessions"
  ON public.user_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND is_user_approved(auth.uid()));

-- Users can update own sessions (revoke)
CREATE POLICY "Users can update own sessions"
  ON public.user_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND is_user_approved(auth.uid()));

-- System inserts (via edge function with service role)
CREATE POLICY "Service can insert sessions"
  ON public.user_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND is_user_approved(auth.uid()));

-- Admins can view all sessions
CREATE POLICY "Admins can view all sessions"
  ON public.user_sessions FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin') AND is_user_approved(auth.uid()));

-- ============================================================
-- 3. LOGIN HISTORY (audit trail for login attempts)
-- ============================================================
CREATE TABLE public.login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, -- nullable for failed attempts where user may not exist
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'blocked', 'mfa_required')),
  failure_reason TEXT, -- e.g. 'invalid_password', 'account_locked', 'mfa_failed'
  ip_address TEXT,
  user_agent TEXT,
  device_info TEXT,
  browser TEXT,
  os TEXT,
  location TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_login_history_user_id ON public.login_history(user_id);
CREATE INDEX idx_login_history_email ON public.login_history(email);
CREATE INDEX idx_login_history_attempted_at ON public.login_history(attempted_at DESC);

ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

-- Users can view own login history
CREATE POLICY "Users can view own login history"
  ON public.login_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND is_user_approved(auth.uid()));

-- Admins can view all login history
CREATE POLICY "Admins can view all login history"
  ON public.login_history FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin') AND is_user_approved(auth.uid()));

-- Insert via edge function (service role) or authenticated user
CREATE POLICY "Authenticated users can insert own login history"
  ON public.login_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow anon inserts for failed login tracking (email only, no user_id)
CREATE POLICY "Anon can insert failed login attempts"
  ON public.login_history FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

-- ============================================================
-- 4. SECURITY AUDIT LOG (security-sensitive actions)
-- ============================================================
CREATE TABLE public.security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_name TEXT,
  action TEXT NOT NULL, -- 'password_change', 'mfa_enable', 'mfa_disable', 'session_revoke', 'role_update', etc.
  target_user_id UUID, -- for admin actions on other users
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_security_audit_user_id ON public.security_audit_log(user_id);
CREATE INDEX idx_security_audit_action ON public.security_audit_log(action);
CREATE INDEX idx_security_audit_performed_at ON public.security_audit_log(performed_at DESC);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can view all security audit logs
CREATE POLICY "Admins can view all security audit logs"
  ON public.security_audit_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin') AND is_user_approved(auth.uid()));

-- Users can view own security events
CREATE POLICY "Users can view own security audit logs"
  ON public.security_audit_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND is_user_approved(auth.uid()));

-- Insert for authenticated users (own actions)
CREATE POLICY "Users can insert own security audit logs"
  ON public.security_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND is_user_approved(auth.uid()));

-- No UPDATE or DELETE allowed (immutable audit trail)

-- ============================================================
-- 5. ADD PROFILE PHOTO TO PROFILES TABLE
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ============================================================
-- 6. ORG SETTINGS TABLE (organization-level config)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.org_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name TEXT NOT NULL DEFAULT 'XBoom',
  logo_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  business_hours_start TEXT NOT NULL DEFAULT '09:00',
  business_hours_end TEXT NOT NULL DEFAULT '18:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

-- All approved users can read org settings
CREATE POLICY "Approved users can view org settings"
  ON public.org_settings FOR SELECT
  TO authenticated
  USING (is_user_approved(auth.uid()));

-- Only admins can update org settings
CREATE POLICY "Admins can update org settings"
  ON public.org_settings FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin') AND is_user_approved(auth.uid()));

CREATE POLICY "Admins can insert org settings"
  ON public.org_settings FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') AND is_user_approved(auth.uid()));

CREATE TRIGGER update_org_settings_updated_at
  BEFORE UPDATE ON public.org_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
