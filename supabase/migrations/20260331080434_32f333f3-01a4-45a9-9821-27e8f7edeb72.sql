
-- Gmail integrations table
CREATE TABLE public.gmail_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Gmail sync logs table
CREATE TABLE public.gmail_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.gmail_integrations(id) ON DELETE CASCADE,
  emails_fetched INTEGER NOT NULL DEFAULT 0,
  leads_created INTEGER NOT NULL DEFAULT 0,
  errors TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gmail_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS: Only admin/marketing can manage gmail integrations
CREATE POLICY "Admin and marketing can manage gmail integrations"
  ON public.gmail_integrations
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'marketing')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'marketing')
  );

-- RLS: Admin/marketing can view sync logs
CREATE POLICY "Admin and marketing can view sync logs"
  ON public.gmail_sync_logs
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'marketing')
  );

-- Service role needs full access for edge functions
CREATE POLICY "Service role full access on gmail_integrations"
  ON public.gmail_integrations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on gmail_sync_logs"
  ON public.gmail_sync_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER set_gmail_integrations_updated_at
  BEFORE UPDATE ON public.gmail_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
