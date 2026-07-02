
CREATE TABLE public.password_reset_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  recipient_user_id uuid,
  from_address text NOT NULL,
  status text NOT NULL,
  provider text NOT NULL DEFAULT 'resend',
  provider_message_id text,
  error_message text,
  triggered_by uuid,
  context text DEFAULT 'admin_reset',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.password_reset_email_log TO authenticated;
GRANT ALL ON public.password_reset_email_log TO service_role;

ALTER TABLE public.password_reset_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR can view password reset log"
ON public.password_reset_email_log
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'hr'::app_role)
);

CREATE INDEX idx_prel_created ON public.password_reset_email_log(created_at DESC);
CREATE INDEX idx_prel_recipient ON public.password_reset_email_log(recipient_email);
