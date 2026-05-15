
ALTER TABLE public.portal_orders
  ADD COLUMN IF NOT EXISTS daas_expires_at date,
  ADD COLUMN IF NOT EXISTS amc_expires_at date;

CREATE TABLE IF NOT EXISTS public.portal_renewal_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.portal_orders(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN ('daas_renewal','amc_expiry')),
  expires_on date NOT NULL,
  alerted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, alert_type, expires_on)
);
ALTER TABLE public.portal_renewal_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal staff read renewal alerts"
ON public.portal_renewal_alerts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
  OR has_role(auth.uid(), 'support'::app_role)
);

CREATE TABLE IF NOT EXISTS public.portal_inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'interakt',
  from_phone text NOT NULL,
  body text,
  raw_payload jsonb,
  matched_contact_id uuid REFERENCES public.portal_contacts(id) ON DELETE SET NULL,
  created_ticket_id uuid REFERENCES public.portal_tickets(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.portal_inbound_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal staff read inbound messages"
ON public.portal_inbound_messages FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
  OR has_role(auth.uid(), 'support'::app_role)
);
CREATE INDEX IF NOT EXISTS idx_portal_inbound_messages_phone ON public.portal_inbound_messages (from_phone, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_orders_daas_expires ON public.portal_orders (daas_expires_at) WHERE daas_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_orders_amc_expires ON public.portal_orders (amc_expires_at) WHERE amc_expires_at IS NOT NULL;
