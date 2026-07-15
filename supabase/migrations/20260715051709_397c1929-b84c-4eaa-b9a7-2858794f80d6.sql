ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.portal_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.notifications.account_id IS 'Portal account ID for deep-linking to KYC review queue';