-- Phone suppression list for SMS sending — numbers that hit permanent carrier
-- failures via MSG91 (Call Barred, Message Service not Supported, Teleservice
-- not supported, Unknown Subscriber, etc.) get added here and are skipped on
-- future sends so we stop being billed for guaranteed-fail messages.

CREATE TABLE IF NOT EXISTS public.sms_phone_suppression (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_e164 TEXT NOT NULL UNIQUE,           -- normalized: '91XXXXXXXXXX'
  reason TEXT NOT NULL,                       -- carrier failure reason from MSG91
  source TEXT NOT NULL DEFAULT 'msg91_dlr',   -- where suppression came from
  first_failure_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_failure_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  failure_count INT NOT NULL DEFAULT 1,
  last_request_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_phone_suppression_phone
  ON public.sms_phone_suppression (phone_e164);

GRANT SELECT ON public.sms_phone_suppression TO authenticated;
GRANT ALL ON public.sms_phone_suppression TO service_role;

ALTER TABLE public.sms_phone_suppression ENABLE ROW LEVEL SECURITY;

-- Admins / supply chain / IT can view; only service role writes.
CREATE POLICY "Privileged roles can view sms suppression"
  ON public.sms_phone_suppression
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'supply_chain'::app_role)
    OR public.has_role(auth.uid(), 'it'::app_role)
  );

CREATE TRIGGER update_sms_phone_suppression_updated_at
  BEFORE UPDATE ON public.sms_phone_suppression
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
