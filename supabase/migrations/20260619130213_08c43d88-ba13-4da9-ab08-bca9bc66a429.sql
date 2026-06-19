
-- feature_flags
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_by_name text
);
GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_flags_read_auth" ON public.feature_flags;
CREATE POLICY "feature_flags_read_auth" ON public.feature_flags
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "feature_flags_admin_upsert" ON public.feature_flags;
CREATE POLICY "feature_flags_admin_upsert" ON public.feature_flags
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "feature_flags_admin_update" ON public.feature_flags;
CREATE POLICY "feature_flags_admin_update" ON public.feature_flags
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.feature_flags (key, enabled, updated_at)
VALUES ('kyc_customer_emails_enabled', true, now())
ON CONFLICT (key) DO NOTHING;

-- kyc_email_log
CREATE TABLE IF NOT EXISTS public.kyc_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  order_number text,
  recipient_email text,
  doc_type text NOT NULL DEFAULT 'kyc_invite',
  status text NOT NULL CHECK (status IN ('sent','failed','skipped','pending')),
  error text,
  attempt_count integer NOT NULL DEFAULT 1,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kyc_email_log_order_id ON public.kyc_email_log(order_id);
CREATE INDEX IF NOT EXISTS idx_kyc_email_log_created_at ON public.kyc_email_log(created_at DESC);

GRANT SELECT ON public.kyc_email_log TO authenticated;
GRANT ALL ON public.kyc_email_log TO service_role;
ALTER TABLE public.kyc_email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kyc_email_log_staff_read" ON public.kyc_email_log;
CREATE POLICY "kyc_email_log_staff_read" ON public.kyc_email_log
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'sales_manager')
    OR public.has_role(auth.uid(), 'finance')
  );
