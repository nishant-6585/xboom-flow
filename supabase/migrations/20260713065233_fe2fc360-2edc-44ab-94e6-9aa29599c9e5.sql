-- Restrict client-side access to Gmail OAuth tokens.
-- Revoke blanket SELECT and grant it only on non-sensitive columns.
REVOKE SELECT ON public.gmail_integrations FROM authenticated;
GRANT SELECT (id, user_id, email, token_expiry, last_synced_at, is_active, created_at, updated_at)
  ON public.gmail_integrations TO authenticated;

-- Ensure UPDATE cannot touch token columns from the client either.
REVOKE UPDATE ON public.gmail_integrations FROM authenticated;
GRANT UPDATE (is_active, updated_at) ON public.gmail_integrations TO authenticated;

-- Service role keeps full access (already granted) for edge functions.
GRANT ALL ON public.gmail_integrations TO service_role;