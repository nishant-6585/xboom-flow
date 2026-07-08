
CREATE TABLE IF NOT EXISTS public.kyc_digilocker_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    TEXT NOT NULL UNIQUE,
  state         TEXT NOT NULL UNIQUE,
  code_verifier TEXT NOT NULL,
  account_id    UUID NOT NULL REFERENCES public.portal_accounts(id) ON DELETE CASCADE,
  contact_id    UUID REFERENCES public.portal_contacts(id) ON DELETE SET NULL,
  actor_user_id UUID,
  redirect_uri  TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.kyc_digilocker_sessions TO service_role;
ALTER TABLE public.kyc_digilocker_sessions ENABLE ROW LEVEL SECURITY;
-- deny-all: no policies for anon/authenticated; only service role reaches this table.

CREATE INDEX IF NOT EXISTS kyc_dl_sessions_account_idx ON public.kyc_digilocker_sessions(account_id);
CREATE INDEX IF NOT EXISTS kyc_dl_sessions_expires_idx ON public.kyc_digilocker_sessions(expires_at);

ALTER TABLE public.kyc_sensitive_data
  ADD COLUMN IF NOT EXISTS document_type         TEXT,
  ADD COLUMN IF NOT EXISTS document_number_full  TEXT;

UPDATE public.kyc_sensitive_data
   SET document_type = 'aadhaar'
 WHERE document_type IS NULL;

ALTER TABLE public.feature_flags
  ADD COLUMN IF NOT EXISTS metadata JSONB;

INSERT INTO public.feature_flags (key, enabled, metadata)
VALUES (
  'digilocker_kyc_test_emails',
  true,
  '["nishant.gearup+unsubtest@gmail.com"]'::jsonb
)
ON CONFLICT (key) DO UPDATE
  SET metadata = EXCLUDED.metadata,
      enabled  = true;
