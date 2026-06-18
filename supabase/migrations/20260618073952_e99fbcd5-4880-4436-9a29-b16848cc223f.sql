CREATE TABLE IF NOT EXISTS public.shopify_pipeline_alert_state (
  alert_key text PRIMARY KEY,
  last_alerted_at timestamptz NOT NULL DEFAULT now(),
  last_payload jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.shopify_pipeline_alert_state TO authenticated;
GRANT ALL    ON public.shopify_pipeline_alert_state TO service_role;

ALTER TABLE public.shopify_pipeline_alert_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read alert state"
  ON public.shopify_pipeline_alert_state
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));