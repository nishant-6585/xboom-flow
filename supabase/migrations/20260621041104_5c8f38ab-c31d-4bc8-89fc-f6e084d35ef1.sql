CREATE TABLE public.zoho_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'zoho_books',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);
GRANT ALL ON public.zoho_oauth_states TO service_role;
ALTER TABLE public.zoho_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.zoho_tokens (
  provider text PRIMARY KEY,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  api_domain text NOT NULL,
  organization_id text,
  scope text,
  expires_at timestamptz NOT NULL,
  connected_by uuid REFERENCES auth.users(id),
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.zoho_tokens TO service_role;
ALTER TABLE public.zoho_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read zoho tokens metadata"
ON public.zoho_tokens FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.zoho_books_invoices (
  invoice_id text PRIMARY KEY,
  organization_id text NOT NULL,
  invoice_number text,
  customer_id text,
  customer_name text,
  status text,
  date date,
  due_date date,
  currency_code text,
  total numeric,
  balance numeric,
  reference_number text,
  created_time timestamptz,
  last_modified_time timestamptz,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.zoho_books_invoices TO authenticated;
GRANT ALL ON public.zoho_books_invoices TO service_role;
ALTER TABLE public.zoho_books_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and Finance can view zoho invoices"
ON public.zoho_books_invoices FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'finance'::app_role)
);
CREATE INDEX idx_zoho_books_invoices_status ON public.zoho_books_invoices(status);
CREATE INDEX idx_zoho_books_invoices_date ON public.zoho_books_invoices(date DESC);

CREATE TABLE public.zoho_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  entity text NOT NULL,
  status text NOT NULL,
  records_synced integer DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  triggered_by uuid REFERENCES auth.users(id)
);
GRANT SELECT ON public.zoho_sync_log TO authenticated;
GRANT ALL ON public.zoho_sync_log TO service_role;
ALTER TABLE public.zoho_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view zoho sync log"
ON public.zoho_sync_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.get_zoho_connection_status(p_provider text DEFAULT 'zoho_books')
RETURNS TABLE (
  connected boolean,
  organization_id text,
  api_domain text,
  scope text,
  expires_at timestamptz,
  connected_at timestamptz,
  connected_by uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (t.provider IS NOT NULL) AS connected,
    t.organization_id,
    t.api_domain,
    t.scope,
    t.expires_at,
    t.connected_at,
    t.connected_by
  FROM (SELECT 1) s
  LEFT JOIN public.zoho_tokens t ON t.provider = p_provider
  WHERE public.has_role(auth.uid(), 'admin'::app_role);
$$;
GRANT EXECUTE ON FUNCTION public.get_zoho_connection_status(text) TO authenticated;