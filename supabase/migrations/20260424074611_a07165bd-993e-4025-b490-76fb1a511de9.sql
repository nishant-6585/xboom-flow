-- Generic key/value app settings (admin-managed)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  updated_by_name TEXT
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Admins read & write
CREATE POLICY "Admins can view app settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert app settings"
  ON public.app_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update app settings"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete app settings"
  ON public.app_settings FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-update updated_at
CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed Exotel Caller ID row (empty value falls back to env var)
INSERT INTO public.app_settings (key, value, description)
VALUES (
  'exotel_caller_id',
  '{"caller_id": ""}'::jsonb,
  'Verified Exotel virtual number used as CallerId for outbound calls. Leave empty to use EXOTEL_CALLER_ID env var.'
)
ON CONFLICT (key) DO NOTHING;