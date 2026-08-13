-- Per-lead ManyChat message log. The webhook stores each incoming message
-- (ManyChat's public API exposes no conversation history, so XBoomFlow
-- accumulates its own timeline from the moment a lead first writes in).
CREATE TABLE public.manychat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.manychat_leads(id) ON DELETE CASCADE,
  manychat_contact_id text,
  channel text,
  message text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_manychat_messages_lead ON public.manychat_messages (lead_id, received_at DESC);

GRANT SELECT ON public.manychat_messages TO authenticated;
GRANT ALL ON public.manychat_messages TO service_role;

ALTER TABLE public.manychat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized roles can view manychat messages"
ON public.manychat_messages FOR SELECT TO authenticated
USING (
  public.is_user_approved(auth.uid()) AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales'::app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::app_role)
    OR public.has_role(auth.uid(), 'supply_chain'::app_role)
  )
);
