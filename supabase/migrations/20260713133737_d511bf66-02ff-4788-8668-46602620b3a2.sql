-- Harden gmail_integrations: revoke default anon grants and ensure sensitive token columns
-- are only accessible to service_role. Client role (authenticated) already has column-level
-- grants that exclude access_token/refresh_token; enforce the same by revoking any leftover
-- broad table privileges from anon.
REVOKE ALL ON public.gmail_integrations FROM anon;
REVOKE ALL ON public.gmail_integrations FROM PUBLIC;

-- Re-affirm that authenticated has NO privilege on access_token / refresh_token columns.
REVOKE ALL (access_token, refresh_token) ON public.gmail_integrations FROM authenticated;
REVOKE ALL (access_token, refresh_token) ON public.gmail_integrations FROM anon;

-- Service role retains full access for edge functions.
GRANT ALL ON public.gmail_integrations TO service_role;