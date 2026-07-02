
CREATE TABLE public.invitation_email_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invitation_id UUID REFERENCES public.user_invitations(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  from_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  error_message TEXT,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  context TEXT NOT NULL DEFAULT 'invitation_approval',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.invitation_email_log TO authenticated;
GRANT ALL ON public.invitation_email_log TO service_role;

ALTER TABLE public.invitation_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and HR can view invitation email log"
ON public.invitation_email_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

CREATE INDEX idx_invitation_email_log_invitation ON public.invitation_email_log(invitation_id);
CREATE INDEX idx_invitation_email_log_recipient ON public.invitation_email_log(recipient_email);

CREATE TRIGGER trg_invitation_email_log_updated_at
BEFORE UPDATE ON public.invitation_email_log
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
