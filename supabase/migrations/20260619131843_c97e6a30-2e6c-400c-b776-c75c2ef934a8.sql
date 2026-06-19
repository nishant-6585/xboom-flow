CREATE TABLE public.portal_invite_tokens (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL,
  email text NOT NULL,
  account_id uuid,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_portal_invite_tokens_user ON public.portal_invite_tokens(auth_user_id);
CREATE INDEX idx_portal_invite_tokens_email ON public.portal_invite_tokens(lower(email));

GRANT ALL ON public.portal_invite_tokens TO service_role;

ALTER TABLE public.portal_invite_tokens ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated => no access from client. Service role bypasses RLS.
CREATE POLICY "service role only - deny all to clients"
  ON public.portal_invite_tokens
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);